class ResourceExistsError extends Error {
  constructor(message, resource) {
    super(message);
    this.name = 'ResourceExistsError';
    this.resource = resource;
  }
}

export default ResourceExistsError;
