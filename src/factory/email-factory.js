import fs from 'fs';
import Handlebars from 'handlebars';
import { uuid } from 'mu';
import config from '../../config';
import { EMAIL_FROM, EMAIL_TO } from '../../env';
import EmailRepository from '../repository/email-repository';
import Email from '../model/email';

const TEMPLATE_PATH = '/app/template/job-alert.hbs';

// Register Handlebars helper for equality check
Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});

/**
 * Extract a readable label from a URI
 * e.g., "http://redpencil.data.gift/id/concept/JobStatus/failed" -> "failed"
 *
 * @param uri - The URI to extract from
 * @returns {string} - The extracted label
 */
function extractLabel(uri) {
  if (!uri) return '';
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
}

/**
 * Format a date to a readable string
 *
 * @param date - The date to format
 * @returns {string} - The formatted date string
 */
function formatDate(date) {
  if (!date) return '';
  if (date instanceof Date) {
    return date.toISOString();
  }
  return String(date);
}

class EmailFactory {
  /**
   * Creates a new Email for a Job alert
   *
   * @param job - The Job object
   * @returns {Email}
   */
  static forJob(job) {
    const templateSource = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const template = Handlebars.compile(templateSource);

    const statusLabel = extractLabel(job.status);
    const operationLabel = extractLabel(job.operation);

    // Prepare task data with labels
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
    const uri = `${EmailRepository.BASE}/${id}`;

    const subjectPrefix = statusLabel.toUpperCase();
    const operationPart = operationLabel ? ` | ${operationLabel}` : '';
    const subject = `[JOB ${subjectPrefix}] ${formatDate(job.modified || job.created)}${operationPart}`;

    return new Email({
      uri,
      uuid: id,
      folder: config.email.folder,
      subject,
      content,
      to: EMAIL_TO,
      from: EMAIL_FROM,
      creator: config.service.uri,
      reference: job.uri,
    });
  }
}

export default EmailFactory;
