import Resource from './resource';

/**
 * Simple Email POJO
 */
class Email extends Resource {
  constructor({
    uri,
    uuid,
    folder,
    subject,
    content,
    to,
    from,
    creator,
    reference,
  }) {
    super(uri, uuid);
    this.folder = folder;
    this.subject = subject;
    this.content = content;
    this.to = to;
    this.from = from;
    this.creator = creator;
    this.reference = reference;
  }
}

export default Email;
