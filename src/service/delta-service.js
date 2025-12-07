import config from '../../config';
import { JOB_OPERATIONS } from '../../env';
import JobRepository from '../repository/job-repository';
import Job from '../model/job';
import AlertService from './alert-service';

class DeltaService {
  /**
   * Process the given list of job URIs
   *
   * @param uris - Array of job URIs to process
   * @returns {Promise<void>}
   */
  static async process(uris) {
    if (!uris || uris.length === 0) {
      console.log('No job URIs to process.');
      return;
    }

    console.log(`Processing ${uris.length} job URI(s)...`);

    // Fetch job details for each URI
    let jobs = await Promise.all(
      uris.map((uri) =>
        JobRepository.findByURI(uri).catch((err) => {
          console.warn(`Failed to fetch job <${uri}>:`, err.message);
          return null;
        })
      )
    );

    // Filter out invalid jobs
    const invalidCount = jobs.filter((job) => !Job.isValid(job)).length;
    if (invalidCount > 0) {
      console.warn(
        `[WARN] ${invalidCount} job(s) will be ignored (not found, not jobs, or malformed).`
      );
    }
    jobs = jobs.filter((job) => Job.isValid(job));

    // Filter by creators if configured
    if (config.creators && config.creators.length > 0) {
      const beforeCount = jobs.length;
      jobs = jobs.filter((job) => config.creators.includes(job.creator));
      const filteredCount = beforeCount - jobs.length;
      if (filteredCount > 0) {
        console.log(
          `Filtered out ${filteredCount} job(s) not matching configured creators.`
        );
      }
    }

    // Filter by operations if configured
    if (JOB_OPERATIONS && JOB_OPERATIONS.length > 0) {
      const beforeCount = jobs.length;
      jobs = jobs.filter((job) => JOB_OPERATIONS.includes(job.operation));
      const filteredCount = beforeCount - jobs.length;
      if (filteredCount > 0) {
        console.log(
          `Filtered out ${filteredCount} job(s) not matching configured operations.`
        );
      }
    }

    if (jobs.length === 0) {
      console.log(
        'Delta did not contain any jobs of interest after filtering.'
      );
      return;
    }

    console.log(`Creating alerts for ${jobs.length} job(s)...`);

    // Create alerts for all matching jobs
    const results = await Promise.allSettled(
      jobs.map((job) => AlertService.create(job))
    );

    // Log results
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (succeeded > 0) {
      console.log(`Successfully created ${succeeded} alert(s).`);
    }

    if (failed > 0) {
      console.warn(`Failed to create ${failed} alert(s).`);
      results
        .filter((r) => r.status === 'rejected')
        .forEach((r) => {
          // ResourceExistsError is expected for duplicate alerts
          if (r.reason?.name === 'ResourceExistsError') {
            console.log(
              `Skipped: Alert already exists for job <${r.reason?.resource?.reference}>`
            );
          } else {
            console.error('Error creating alert:', r.reason);
          }
        });
    }
  }
}

export default DeltaService;
