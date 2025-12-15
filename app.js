import bodyParser from 'body-parser';
import { app, errorHandler } from 'mu';
import config from './config';
import { DEBUG, JOB_STATUSES, JOB_OPERATIONS } from './env';
import { findJobByUri, filterJobs, findJobsWithoutAlerts, extractLabel } from './lib/job';
import { createAlertForJob } from './lib/email';

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
 * Extract job URIs from delta message that match monitored statuses
 */
function extractJobUrisFromDelta(delta) {
  const inserts = delta.flatMap((changeSet) => changeSet.inserts || []);
  return inserts
    .filter(
      (t) =>
        t.predicate.value === 'http://www.w3.org/ns/adms#status' &&
        JOB_STATUSES.includes(t.object.value)
    )
    .map((t) => t.subject.value);
}

/**
 * Process job URIs: fetch details, filter, create alerts
 */
async function processJobUris(uris) {
  if (!uris?.length) {
    console.log('No job URIs to process.');
    return { processed: 0, created: 0 };
  }

  console.log(`Processing ${uris.length} job URI(s)...`);

  // Fetch job details
  const jobs = await Promise.all(
    uris.map((uri) =>
      findJobByUri(uri).catch((err) => {
        console.warn(`Failed to fetch job <${uri}>:`, err.message);
        return null;
      })
    )
  );

  // Filter invalid and non-matching jobs
  const validJobs = filterJobs(jobs.filter(Boolean));

  if (validJobs.length === 0) {
    console.log('No valid jobs to process after filtering.');
    return { processed: 0, created: 0 };
  }

  console.log(`Creating alerts for ${validJobs.length} job(s)...`);

  // Create alerts
  const results = await Promise.allSettled(validJobs.map((job) => createAlertForJob(job)));

  let created = 0;
  let skipped = 0;

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      if (result.value.created) {
        created++;
      } else {
        skipped++;
        console.log(`Skipped: Alert already exists for job <${validJobs[i].uri}>`);
      }
    } else {
      console.error(`Error creating alert for job <${validJobs[i].uri}>:`, result.reason);
    }
  });

  if (created > 0) console.log(`Successfully created ${created} alert(s).`);
  if (skipped > 0) console.log(`Skipped ${skipped} job(s) with existing alerts.`);

  return { processed: validJobs.length, created };
}

/**
 * Health check
 */
app.get('/', (req, res) => {
  res.send("Hello, you've reached the job-alert-service. Monitoring jobs for status changes.");
});

/**
 * Process deltas from delta-notifier
 */
app.post('/delta', (req, res) => {
  const jobURIs = extractJobUrisFromDelta(req.body);

  if (DEBUG) {
    console.log('Received delta, matching job URIs:', jobURIs);
  }

  if (!jobURIs.length) {
    if (DEBUG) console.log('Delta did not contain any jobs with monitored status.');
    return res.status(204).send();
  }

  console.log(`Found ${jobURIs.length} job(s) with monitored status in delta.`);

  // Process asynchronously
  processJobUris(jobURIs).catch((e) => {
    console.error('Error processing delta:', e);
  });

  return res.status(204).send();
});

/**
 * Manually create alerts for jobs without alerts
 */
app.post('/create-alerts', async (req, res, next) => {
  try {
    console.log('Manual alert creation triggered');

    const options = {};
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (isNaN(since.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for "since" parameter' });
      }
      options.since = since;
      console.log(`Creating alerts for jobs modified since: ${since.toISOString()}`);
    }

    const jobs = await findJobsWithoutAlerts(options);
    console.log(`Found ${jobs.length} job(s) without alerts.`);

    if (jobs.length === 0) {
      return res.status(200).json({ message: 'No jobs found requiring alerts.', found: 0, created: 0 });
    }

    const result = await processJobUris(jobs.map((j) => j.uri));

    return res.status(200).json({
      message: `Created ${result.created} alert(s) for ${jobs.length} matching job(s).`,
      found: jobs.length,
      created: result.created,
    });
  } catch (e) {
    console.error('Error creating alerts:', e);
    return next(e);
  }
});

/**
 * Dry run: find jobs that would receive alerts
 */
app.post('/dry-run', async (req, res, next) => {
  try {
    console.log('Dry run triggered');

    const options = {};
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (isNaN(since.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for "since" parameter' });
      }
      options.since = since;
      console.log(`Dry run for jobs modified since: ${since.toISOString()}`);
    }

    const jobs = await findJobsWithoutAlerts(options);

    console.log(`[DRY RUN] Found ${jobs.length} job(s) without alerts.`);

    return res.status(200).json({
      message: `Dry run completed. Found ${jobs.length} job(s) that would receive alerts.`,
      count: jobs.length,
      jobs,
    });
  } catch (e) {
    console.error('Error during dry run:', e);
    return next(e);
  }
});

app.use(errorHandler);
