import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';

/**
 * Parse a SPARQL result binding value to a native JavaScript type
 *
 * @param binding - The SPARQL binding object with type and value
 * @returns {*} - The parsed value
 */
function parseBinding(binding) {
  if (!binding) return null;

  switch (binding.type) {
    case 'uri':
      return binding.value;
    case 'typed-literal':
      if (binding.datatype === 'http://www.w3.org/2001/XMLSchema#dateTime') {
        return new Date(binding.value);
      }
      if (binding.datatype === 'http://www.w3.org/2001/XMLSchema#integer') {
        return parseInt(binding.value, 10);
      }
      return binding.value;
    case 'literal':
    default:
      return binding.value;
  }
}

/**
 * Parse SPARQL query results to an array of objects
 *
 * @param results - The SPARQL query results
 * @returns {Object[]} - Array of parsed result objects
 */
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
  parseBinding,
  parseResults,
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
};
