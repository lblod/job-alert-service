/**
 * Simple Delta POJO for processing mu-delta-notifier messages
 */
class Delta {
  constructor(delta) {
    this.delta = delta;
  }

  get inserts() {
    return this.delta.flatMap((changeSet) => changeSet.inserts || []);
  }

  /**
   * Get all subjects that have a specific predicate-object combination inserted
   *
   * @param predicate - The predicate URI to match
   * @param object - The object value to match
   * @returns {string[]} - Array of subject URIs
   */
  getInsertsFor(predicate, object) {
    return this.inserts
      .filter(
        (t) => t.predicate.value === predicate && t.object.value === object
      )
      .map((t) => t.subject.value);
  }

  /**
   * Get all subjects that have a specific predicate inserted with any of the given objects
   *
   * @param predicate - The predicate URI to match
   * @param objects - Array of object values to match
   * @returns {string[]} - Array of subject URIs
   */
  getInsertsForAny(predicate, objects) {
    return this.inserts
      .filter(
        (t) =>
          t.predicate.value === predicate && objects.includes(t.object.value)
      )
      .map((t) => t.subject.value);
  }
}

export default Delta;
