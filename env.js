import env from 'env-var';

let EMAIL_FROM;
let EMAIL_TO;

try {
  EMAIL_FROM = env.get('EMAIL_FROM').required().asString();
  EMAIL_TO = env.get('EMAIL_TO').required().asString();
} catch (e) {
  console.warn('Required environment variable was not found:');
  console.warn(e);
  process.exit(1);
}

const DEBUG = env.get('DEBUG').default('false').asBool();

// Job statuses to trigger alerts on (comma-separated URIs)
const JOB_STATUSES = env
  .get('JOB_STATUSES')
  .default('http://redpencil.data.gift/id/concept/JobStatus/failed')
  .asString()
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Optional: Job operations to filter on (comma-separated URIs, empty means all)
const JOB_OPERATIONS = env
  .get('JOB_OPERATIONS')
  .default('')
  .asString()
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

export { EMAIL_FROM, EMAIL_TO, DEBUG, JOB_STATUSES, JOB_OPERATIONS };
