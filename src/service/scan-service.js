import { querySudo as query } from '@lblod/mu-auth-sudo';
import config from '../../config';
import { JOB_STATUSES, JOB_OPERATIONS } from '../../env';
import { parseResults } from '../util/sparql';
import DeltaService from './delta-service';

const PREFIXES = `
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
  PREFIX dcterms: <http://purl.org/dc/terms/>
  PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
`;

/**
 * Build filter clauses based on configuration
 */
function buildFilters(options = {}) {
  const statuses = options.statuses || JOB_STATUSES;
  const since = options.since;

  const statusValues = statuses.map((s) => `<${s}>`).join(', ');

  const filters = [`FILTER (?status IN (${statusValues}))`];

  if (since) {
    filters.push(
      `FILTER (?modified >= "${since.toISOString()}"^^xsd:dateTime)`
    );
  }

  if (JOB_OPERATIONS && JOB_OPERATIONS.length > 0) {
    const operationValues = JOB_OPERATIONS.map((o) => `<${o}>`).join(', ');
    filters.push(`FILTER (?operation IN (${operationValues}))`);
  }

  if (config.creators && config.creators.length > 0) {
    const creatorValues = config.creators.map((c) => `<${c}>`).join(', ');
    filters.push(`FILTER (?creator IN (${creatorValues}))`);
  }

  return filters.join('\n          ');
}

/**
 * Extract a readable label from a URI
 * e.g., "http://redpencil.data.gift/id/concept/JobStatus/failed" -> "failed"
 */
function extractLabel(uri) {
  if (!uri) return null;
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
}

class ScanService {
  /**
   * Dry run: find jobs that would be alerted without creating emails
   *
   * @param options - Optional overrides
   * @param options.statuses - Array of status URIs to scan for (defaults to JOB_STATUSES)
   * @param options.since - Only scan jobs modified since this date
   * @returns {Promise<{count: number, jobs: Array}>}
   */
  static async dryRun(options = {}) {
    const statuses = options.statuses || JOB_STATUSES;
    const filters = buildFilters(options);

    console.log(
      `[DRY RUN] Scanning for jobs with statuses: ${statuses.join(', ')}`
    );

    const scanQuery = `
      ${PREFIXES}
      SELECT DISTINCT ?job ?uuid ?status ?operation ?created ?modified ?creator
      WHERE {
        GRAPH <${config.graph.job}> {
          ?job a cogs:Job ;
               adms:status ?status .
          OPTIONAL { ?job mu:uuid ?uuid . }
          OPTIONAL { ?job task:operation ?operation . }
          OPTIONAL { ?job dcterms:creator ?creator . }
          OPTIONAL { ?job dcterms:created ?created . }
          OPTIONAL { ?job dcterms:modified ?modified . }
          ${filters}
        }
        FILTER NOT EXISTS {
          GRAPH <${config.graph.email}> {
            ?email a nmo:Email ;
                   dcterms:references ?job .
          }
        }
      }
    `;

    const results = await query(scanQuery);
    const parsed = parseResults(results);

    console.log(`[DRY RUN] Found ${parsed.length} job(s) without alerts.`);

    const jobs = parsed.map((r) => ({
      uri: r.job,
      uuid: r.uuid,
      status: r.status,
      statusLabel: extractLabel(r.status),
      operation: r.operation,
      operationLabel: extractLabel(r.operation),
      created: r.created,
      modified: r.modified,
      creator: r.creator,
    }));

    return { count: jobs.length, jobs };
  }

  /**
   * Create alerts for jobs with monitored statuses that don't have alerts yet
   *
   * @param options - Optional overrides
   * @param options.statuses - Array of status URIs to filter on (defaults to JOB_STATUSES)
   * @param options.since - Only include jobs modified since this date
   * @returns {Promise<{found: number, created: number}>}
   */
  static async createAlerts(options = {}) {
    const statuses = options.statuses || JOB_STATUSES;
    const filters = buildFilters(options);

    console.log(`Creating alerts for jobs with statuses: ${statuses.join(', ')}`);

    const findJobsQuery = `
      ${PREFIXES}
      SELECT DISTINCT ?job
      WHERE {
        GRAPH <${config.graph.job}> {
          ?job a cogs:Job ;
               adms:status ?status .
          OPTIONAL { ?job task:operation ?operation . }
          OPTIONAL { ?job dcterms:creator ?creator . }
          OPTIONAL { ?job dcterms:modified ?modified . }
          ${filters}
        }
        FILTER NOT EXISTS {
          GRAPH <${config.graph.email}> {
            ?email a nmo:Email ;
                   dcterms:references ?job .
          }
        }
      }
    `;

    const results = await query(findJobsQuery);
    const parsed = parseResults(results);
    const jobURIs = parsed.map((r) => r.job);

    console.log(`Found ${jobURIs.length} job(s) without alerts.`);

    if (jobURIs.length === 0) {
      return { found: 0, created: 0 };
    }

    // Process the jobs through the existing delta service
    await DeltaService.process(jobURIs);

    return { found: jobURIs.length, created: jobURIs.length };
  }
}

export default ScanService;
