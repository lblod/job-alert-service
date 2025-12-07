import Resource from './resource';

/**
 * Task POJO representing a task:Task from the triplestore
 */
class Task extends Resource {
  constructor({
    uri,
    uuid,
    status,
    operation,
    index,
    created,
    modified,
    error,
  }) {
    super(uri, uuid);
    this.status = status;
    this.operation = operation;
    this.index = index;
    this.created = created;
    this.modified = modified;
    this.error = error;
  }
}

export default Task;
