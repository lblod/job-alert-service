import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import config from '../../config';
import { parseResults } from '../util/sparql';
import Email from '../model/email';

const BASE = 'http://data.lblod.info/id/emails';

const PREFIXES = `
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
  PREFIX dcterms: <http://purl.org/dc/terms/>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>
  PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
  PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
`;

class EmailRepository {
  static BASE = BASE;

  /**
   * Find an email by the job it references
   *
   * @param job - The job object
   * @returns {Promise<Email|null>}
   */
  static async findOneByJob(job) {
    if (!job?.uri) return null;
    return this.findOneByRef(job.uri);
  }

  /**
   * Find an email by reference URI
   *
   * @param ref - The reference URI (job URI)
   * @returns {Promise<Email|null>}
   */
  static async findOneByRef(ref) {
    if (!ref) return null;

    const emailQuery = `
      ${PREFIXES}
      SELECT ?uri ?uuid ?folder ?subject ?content ?to ?from ?creator
      WHERE {
        GRAPH <${config.graph.email}> {
          ?uri a nmo:Email ;
            mu:uuid ?uuid ;
            dcterms:references ${sparqlEscapeUri(ref)} .
          OPTIONAL { ?uri nie:url ?folder . }
          OPTIONAL { ?uri nmo:messageSubject ?subject . }
          OPTIONAL { ?uri nmo:htmlMessageContent ?content . }
          OPTIONAL { ?uri nmo:emailTo ?to . }
          OPTIONAL { ?uri nmo:messageFrom ?from . }
          OPTIONAL { ?uri dcterms:creator ?creator . }
        }
      }
    `;

    const results = await query(emailQuery);
    const parsed = parseResults(results);

    if (parsed.length === 0) return null;

    const emailData = parsed[0];
    return new Email({
      uri: emailData.uri,
      uuid: emailData.uuid,
      folder: emailData.folder,
      subject: emailData.subject,
      content: emailData.content,
      to: emailData.to,
      from: emailData.from,
      creator: emailData.creator,
      reference: ref,
    });
  }

  /**
   * Create a new email in the triplestore
   *
   * @param email - The email object to create
   * @returns {Promise<Email>}
   */
  static async create(email) {
    const now = new Date();

    const insertQuery = `
      ${PREFIXES}
      INSERT DATA {
        GRAPH <${config.graph.email}> {
          ${sparqlEscapeUri(email.uri)} a nmo:Email ;
            mu:uuid ${sparqlEscapeString(email.uuid)} ;
            nmo:messageSubject ${sparqlEscapeString(email.subject)} ;
            nmo:htmlMessageContent ${sparqlEscapeString(email.content)} ;
            nmo:emailTo ${sparqlEscapeString(email.to)} ;
            nmo:messageFrom ${sparqlEscapeString(email.from)} ;
            nie:url ${sparqlEscapeUri(email.folder)} ;
            dcterms:creator ${sparqlEscapeUri(email.creator)} ;
            dcterms:references ${sparqlEscapeUri(email.reference)} ;
            dcterms:created ${sparqlEscapeDateTime(now)} .
        }
      }
    `;

    await update(insertQuery);
    return email;
  }
}

export default EmailRepository;
