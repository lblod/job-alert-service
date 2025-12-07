const defaultConfig = {
  base: 'http://lblod.data.gift',
  service: {
    uri: 'http://lblod.data.gift/services/job-alert-service',
  },
  // Filter by creator URIs (empty array means all creators)
  creators: [],
  email: {
    folder: 'http://data.lblod.info/id/mail-folders/2',
  },
  graph: {
    email: 'http://mu.semte.ch/graphs/system/email',
    job: 'http://mu.semte.ch/graphs/jobs',
  },
};

let userConfig = {};
try {
  userConfig = require('/config/config.json');
} catch (e) {
  console.log("Couldn't find user config, continuing with defaults...");
}

// Deep merge for nested objects
const config = {
  ...defaultConfig,
  ...userConfig,
  email: { ...defaultConfig.email, ...userConfig.email },
  graph: { ...defaultConfig.graph, ...userConfig.graph },
  service: { ...defaultConfig.service, ...userConfig.service },
};

export default config;
