import Resource from './resource';

/**
 * Job POJO representing a cogs:Job from the triplestore
 */
class Job extends Resource {
  constructor({
    uri,
    uuid,
    status,
    operation,
    created,
    modified,
    creator,
    tasks,
  }) {
    super(uri, uuid);
    this.status = status;
    this.operation = operation;
    this.created = created;
    this.modified = modified;
    this.creator = creator;
    this.tasks = tasks || [];
  }

  /**
   * Returns whether a given Job is valid for alerting
   *
   * @param job
   * @returns {boolean}
   */
  static isValid(job) {
    if (!job) return false;
    if (!job.uri) return false;
    if (!job.status) return false;
    return true;
  }
}

export default Job;
