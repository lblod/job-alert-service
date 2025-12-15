import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';

/**
 * Parse SPARQL result bindings to plain JS values
 */
function parseBinding(binding) {
  if (!binding) return null;
  if (binding.datatype === 'http://www.w3.org/2001/XMLSchema#dateTime') {
    return new Date(binding.value);
  }
  if (binding.datatype === 'http://www.w3.org/2001/XMLSchema#integer') {
    return parseInt(binding.value, 10);
  }
  return binding.value;
}

function parseResults(results) {
  if (!results?.results?.bindings) return [];
  return results.results.bindings.map((binding) => {
    const parsed = {};
    for (const key of Object.keys(binding)) {
      parsed[key] = parseBinding(binding[key]);
    }
    return parsed;
  });
}

export {
  query,
  update,
  parseResults,
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
};
