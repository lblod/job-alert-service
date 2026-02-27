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

// Rate limiting configuration
const RATE_LIMIT_ENABLED = env.get('RATE_LIMIT_ENABLED').default('true').asBool();
const RATE_LIMIT_MAX = env.get('RATE_LIMIT_MAX').default('3').asIntPositive();
const RATE_LIMIT_WINDOW_HOURS = env.get('RATE_LIMIT_WINDOW_HOURS').default('1').asIntPositive();
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000;

export {
  EMAIL_FROM,
  EMAIL_TO,
  DEBUG,
  JOB_STATUSES,
  JOB_OPERATIONS,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_HOURS,
  RATE_LIMIT_WINDOW_MS,
};
