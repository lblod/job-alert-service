import fs from 'fs';
import Handlebars from 'handlebars';
import { uuid } from 'mu';
import config from '../config';
import { EMAIL_FROM, EMAIL_TO } from '../env';
import { query, update, parseResults, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from './sparql';
import { extractLabel } from './job';

const TEMPLATE_PATH = '/app/template/job-alert.hbs';
const EMAIL_BASE = 'http://data.lblod.info/id/emails';

const PREFIXES = `
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX dcterms: <http://purl.org/dc/terms/>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
`;

// Register Handlebars helper
Handlebars.registerHelper('eq', (a, b) => a === b);

function formatDate(date) {
  if (!date) return '';
  return date instanceof Date ? date.toISOString() : String(date);
}

/**
 * Check if an alert email already exists for a job
 */
export async function alertExistsForJob(jobUri) {
  if (!jobUri) return false;

  const emailQuery = `
    ${PREFIXES}
    ASK {
      GRAPH <${config.graph.email}> {
        ?uri a nmo:Email ;
          dcterms:references ${sparqlEscapeUri(jobUri)} .
      }
    }
  `;

  const results = await query(emailQuery);
  return results.boolean === true;
}

/**
 * Create and persist an alert email for a job
 */
export async function createAlertForJob(job) {
  // Check for existing alert
  if (await alertExistsForJob(job.uri)) {
    return { created: false, reason: 'alert_exists' };
  }

  // Render email content
  const templateSource = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const template = Handlebars.compile(templateSource);

  const statusLabel = extractLabel(job.status);
  const operationLabel = extractLabel(job.operation);

  const tasksWithLabels = (job.tasks || []).map((task) => ({
    uri: task.uri,
    uuid: task.uuid,
    index: task.index ?? '?',
    status: task.status,
    statusLabel: extractLabel(task.status),
    operation: task.operation,
    operationLabel: extractLabel(task.operation),
    error: task.error,
  }));

  const content = template({
    jobUri: job.uri,
    jobUuid: job.uuid,
    status: job.status,
    statusLabel,
    operation: job.operation,
    operationLabel,
    created: formatDate(job.created),
    modified: formatDate(job.modified),
    creator: job.creator,
    tasks: tasksWithLabels,
  });

  const id = uuid();
  const uri = `${EMAIL_BASE}/${id}`;
  const operationPart = operationLabel ? ` | ${operationLabel}` : '';
  const subject = `[JOB ${statusLabel.toUpperCase()}] ${formatDate(job.modified || job.created)}${operationPart}`;

  // Persist email
  const now = new Date();
  const insertQuery = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH <${config.graph.email}> {
        ${sparqlEscapeUri(uri)} a nmo:Email ;
          mu:uuid ${sparqlEscapeString(id)} ;
          nmo:messageSubject ${sparqlEscapeString(subject)} ;
          nmo:htmlMessageContent ${sparqlEscapeString(content)} ;
          nmo:emailTo ${sparqlEscapeString(EMAIL_TO)} ;
          nmo:messageFrom ${sparqlEscapeString(EMAIL_FROM)} ;
          nie:url ${sparqlEscapeUri(config.email.folder)} ;
          dcterms:creator ${sparqlEscapeUri(config.service.uri)} ;
          dcterms:references ${sparqlEscapeUri(job.uri)} ;
          dcterms:created ${sparqlEscapeDateTime(now)} .
      }
    }
  `;

  await update(insertQuery);
  return { created: true, uri, uuid: id };
}
