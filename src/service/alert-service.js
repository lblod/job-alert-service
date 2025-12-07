import ResourceExistsError from '../error/resource-exists-error';
import EmailFactory from '../factory/email-factory';
import EmailRepository from '../repository/email-repository';

class AlertService {
  /**
   * Create an alert email for the given Job
   *
   * @param job - The Job object
   * @returns {Promise<Email>}
   * @throws {ResourceExistsError} if an alert for the given Job was already created
   */
  static async create(job) {
    // Check if we already sent an alert for this job
    const existingEmail = await EmailRepository.findOneByJob(job);
    if (existingEmail) {
      throw new ResourceExistsError(
        'Alert for job has already been created before.',
        existingEmail
      );
    }

    // Create and persist the new email
    const email = EmailFactory.forJob(job);
    return await EmailRepository.create(email);
  }
}

export default AlertService;
