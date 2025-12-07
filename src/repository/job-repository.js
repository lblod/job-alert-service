import { querySudo as query } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';
import config from '../../config';
import { parseResults } from '../util/sparql';
import Job from '../model/job';
import Task from '../model/task';

const PREFIXES = `
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX dcterms: <http://purl.org/dc/terms/>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX adms: <http://www.w3.org/ns/adms#>
  PREFIX cogs: <http://vocab.deri.ie/cogs#>
  PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
`;

class JobRepository {
  /**
   * Find a job by its URI, including its failed tasks
   *
   * @param uri - The job URI
   * @returns {Promise<Job|null>}
   */
  static async findByURI(uri) {
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
    if (parsed.length > 1) {
      throw new Error(`Multiple jobs found for URI <${uri}>`);
    }

    const jobData = parsed[0];

    // Fetch tasks associated with this job
    const tasks = await this.findTasksByJobURI(uri);

    return new Job({
      uri,
      uuid: jobData.uuid,
      status: jobData.status,
      operation: jobData.operation,
      created: jobData.created,
      modified: jobData.modified,
      creator: jobData.creator,
      tasks,
    });
  }

  /**
   * Find all tasks belonging to a job
   *
   * @param jobUri - The job URI
   * @returns {Promise<Task[]>}
   */
  static async findTasksByJobURI(jobUri) {
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
    const parsed = parseResults(results);

    return parsed.map(
      (t) =>
        new Task({
          uri: t.uri,
          uuid: t.uuid,
          status: t.status,
          operation: t.operation,
          index: t.index,
          created: t.created,
          modified: t.modified,
          error: t.errorMessage,
        })
    );
  }
}

export default JobRepository;
