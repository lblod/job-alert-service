import config from '../config';
import { JOB_STATUSES, JOB_OPERATIONS } from '../env';
import { query, parseResults, sparqlEscapeUri } from './sparql';

const PREFIXES = `
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX dcterms: <http://purl.org/dc/terms/>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
  PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
`;

/**
 * Extract a readable label from a URI (last path segment)
 */
export function extractLabel(uri) {
  if (!uri) return '';
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
}

/**
 * Check if a job is valid for alerting
 */
export function isValidJob(job) {
  return job && job.uri && job.status;
}

/**
 * Filter jobs by configured creators and operations
 */
export function filterJobs(jobs) {
  let filtered = jobs.filter(isValidJob);

  if (config.creators?.length > 0) {
    const before = filtered.length;
    filtered = filtered.filter((job) => config.creators.includes(job.creator));
    const diff = before - filtered.length;
    if (diff > 0) console.log(`Filtered out ${diff} job(s) not matching configured creators.`);
  }

  if (JOB_OPERATIONS?.length > 0) {
    const before = filtered.length;
    filtered = filtered.filter((job) => JOB_OPERATIONS.includes(job.operation));
    const diff = before - filtered.length;
    if (diff > 0) console.log(`Filtered out ${diff} job(s) not matching configured operations.`);
  }

  return filtered;
}

/**
 * Fetch a job by URI with its tasks
 */
export async function findJobByUri(uri) {
  if (!uri) throw new Error('URI is required');

  const jobQuery = `
    ${PREFIXES}
    SELECT ?uuid ?status ?operation ?created ?modified ?creator
    WHERE {
      GRAPH <${config.graph.job}> {
        ${sparqlEscapeUri(uri)} a cogs:Job ;
          mu:uuid ?uuid ;
          adms:status ?status .
        OPTIONAL { ${sparqlEscapeUri(uri)} task:operation ?operation . }
        OPTIONAL { ${sparqlEscapeUri(uri)} dcterms:created ?created . }
        OPTIONAL { ${sparqlEscapeUri(uri)} dcterms:modified ?modified . }
        OPTIONAL { ${sparqlEscapeUri(uri)} dcterms:creator ?creator . }
      }
    }
  `;

  const results = await query(jobQuery);
  const parsed = parseResults(results);

  if (parsed.length === 0) return null;
  if (parsed.length > 1) throw new Error(`Multiple jobs found for URI <${uri}>`);

  const jobData = parsed[0];
  const tasks = await findTasksByJobUri(uri);

  return {
    uri,
    uuid: jobData.uuid,
    status: jobData.status,
    operation: jobData.operation,
    created: jobData.created,
    modified: jobData.modified,
    creator: jobData.creator,
    tasks,
  };
}

/**
 * Fetch tasks belonging to a job
 */
async function findTasksByJobUri(jobUri) {
  const taskQuery = `
    ${PREFIXES}
    SELECT ?uri ?uuid ?status ?operation ?index ?created ?modified ?errorMessage
    WHERE {
      GRAPH <${config.graph.job}> {
        ?uri a task:Task ;
          mu:uuid ?uuid ;
          dcterms:isPartOf ${sparqlEscapeUri(jobUri)} .
        OPTIONAL { ?uri adms:status ?status . }
        OPTIONAL { ?uri task:operation ?operation . }
        OPTIONAL { ?uri task:index ?index . }
        OPTIONAL { ?uri dcterms:created ?created . }
        OPTIONAL { ?uri dcterms:modified ?modified . }
        OPTIONAL {
          ?error a task:Error ;
            task:task ?uri ;
            task:message ?errorMessage .
        }
      }
    }
    ORDER BY ?index
  `;

  const results = await query(taskQuery);
  return parseResults(results).map((t) => ({
    uri: t.uri,
    uuid: t.uuid,
    status: t.status,
    operation: t.operation,
    index: t.index,
    created: t.created,
    modified: t.modified,
    error: t.errorMessage,
  }));
}

/**
 * Build SPARQL filter clauses based on options
 */
function buildFilters(options = {}) {
  const statuses = options.statuses || JOB_STATUSES;
  const statusValues = statuses.map((s) => `<${s}>`).join(', ');
  const filters = [`FILTER (?status IN (${statusValues}))`];

  if (options.since) {
    filters.push(`FILTER (?modified >= "${options.since.toISOString()}"^^xsd:dateTime)`);
  }

  if (JOB_OPERATIONS?.length > 0) {
    const operationValues = JOB_OPERATIONS.map((o) => `<${o}>`).join(', ');
    filters.push(`FILTER (?operation IN (${operationValues}))`);
  }

  if (config.creators?.length > 0) {
    const creatorValues = config.creators.map((c) => `<${c}>`).join(', ');
    filters.push(`FILTER (?creator IN (${creatorValues}))`);
  }

  return filters.join('\n          ');
}

/**
 * Find jobs without alerts (for scanning/dry-run)
 */
export async function findJobsWithoutAlerts(options = {}) {
  const filters = buildFilters(options);

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
  return parseResults(results).map((r) => ({
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
}
