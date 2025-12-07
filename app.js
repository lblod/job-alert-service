import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';
import config from './config';
import { DEBUG, JOB_STATUSES, JOB_OPERATIONS } from './env';
import Delta from './src/model/delta';
import DeltaService from './src/service/delta-service';
import ScanService from './src/service/scan-service';

// Log configuration on startup
console.log('Job Alert Service starting...');
console.log(`Monitoring job statuses: ${JOB_STATUSES.join(', ')}`);
if (JOB_OPERATIONS.length > 0) {
  console.log(`Filtering by operations: ${JOB_OPERATIONS.join(', ')}`);
}
if (config.creators.length > 0) {
  console.log(`Filtering by creators: ${config.creators.join(', ')}`);
}
if (DEBUG) {
  console.log('Debug mode enabled');
  console.log('Full config:', JSON.stringify(config, null, 2));
}

app.use(bodyParser.json());

/**
 * Health check endpoint
 */
app.get('/', function (req, res) {
  res.send(
    "Hello, you've reached the job-alert-service. Monitoring jobs for status changes."
  );
});

/**
 * Process incoming deltas from the delta-notifier
 * Triggers alerts when jobs reach a configured status (e.g., failed)
 */
app.post('/delta', (req, res) => {
  const delta = new Delta(req.body);

  // Find all job URIs that have been updated to one of the monitored statuses
  const jobURIs = delta.getInsertsForAny(
    'http://www.w3.org/ns/adms#status',
    JOB_STATUSES
  );

  if (DEBUG) {
    console.log('Received delta with inserts:', delta.inserts.length);
    console.log('Matching job URIs:', jobURIs);
  }

  if (!jobURIs.length) {
    if (DEBUG) {
      console.log(
        'Delta did not contain any jobs with monitored status, awaiting next batch.'
      );
    }
    return res.status(204).send();
  }

  console.log(
    `Found ${jobURIs.length} job(s) with monitored status in delta.`
  );

  // Process asynchronously to prevent missing deltas
  DeltaService.process(jobURIs).catch((e) => {
    console.error('Something went wrong while processing delta:');
    console.error(e);
  });

  return res.status(204).send();
});

/**
 * Manually create alerts for jobs with monitored statuses
 * Creates alerts for any matching jobs that don't have one yet
 *
 * Query parameters:
 * - since: ISO date string to only include jobs modified after this date
 */
app.post('/create-alerts', async (req, res, next) => {
  try {
    console.log('Manual alert creation triggered');

    const options = {};

    // Parse optional 'since' parameter
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (isNaN(since.getTime())) {
        return res
          .status(400)
          .json({ error: 'Invalid date format for "since" parameter' });
      }
      options.since = since;
      console.log(`Creating alerts for jobs modified since: ${since.toISOString()}`);
    }

    const result = await ScanService.createAlerts(options);

    return res.status(200).json({
      message: `Created ${result.created} alert(s) for ${result.found} matching job(s).`,
      ...result,
    });
  } catch (e) {
    console.error('Error creating alerts:', e);
    return next(e);
  }
});

/**
 * Dry run: find jobs that would be alerted without creating emails
 * Useful for testing configuration and previewing results
 *
 * Query parameters:
 * - since: ISO date string to only scan jobs modified after this date
 */
app.post('/dry-run', async (req, res, next) => {
  try {
    console.log('Dry run triggered');

    const options = {};

    // Parse optional 'since' parameter
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (isNaN(since.getTime())) {
        return res
          .status(400)
          .json({ error: 'Invalid date format for "since" parameter' });
      }
      options.since = since;
      console.log(`Dry run for jobs modified since: ${since.toISOString()}`);
    }

    const result = await ScanService.dryRun(options);

    return res.status(200).json({
      message: `Dry run completed. Found ${result.count} job(s) that would receive alerts.`,
      ...result,
    });
  } catch (e) {
    console.error('Error during dry run:', e);
    return next(e);
  }
});

app.use(errorHandler);
