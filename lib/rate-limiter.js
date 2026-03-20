import { RATE_LIMIT_ENABLED, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../env';
import { extractLabel } from './job';

const NO_CREATOR_KEY = '__no_creator__';

/**
 * In-memory rate limit state per creator.
 * Map<string, { windowStart: number, emailCount: number, suppressedJobs: Array }>
 */
const windows = new Map();

/**
 * Resolve the rate-limit key for a job.
 */
function resolveKey(job) {
  return job.creator || NO_CREATOR_KEY;
}

/**
 * Get or create the window state for a key, resetting if the window has expired.
 */
function getWindow(key) {
  const now = Date.now();
  let state = windows.get(key);
  let previousSuppressed = [];

  if (!state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
    if (state && state.suppressedJobs.length > 0) {
      previousSuppressed = [...state.suppressedJobs];
    }
    state = { windowStart: now, emailCount: 0, suppressedJobs: [] };
    windows.set(key, state);
  }

  return { state, previousSuppressed };
}

/**
 * Check whether an email can be sent for the given job and record the decision.
 *
 * Returns:
 *   allowed: boolean          - whether the email should be created
 *   isLastAllowed: boolean    - true if this is the last email allowed in the window
 *   previousSuppressed: Array - suppressed jobs from the expired prior window (for summary)
 */
export function checkRateLimit(job) {
  if (!RATE_LIMIT_ENABLED) {
    return { allowed: true, isLastAllowed: false, previousSuppressed: [] };
  }

  const key = resolveKey(job);
  const { state, previousSuppressed } = getWindow(key);

  if (state.emailCount < RATE_LIMIT_MAX) {
    state.emailCount++;
    const isLastAllowed = state.emailCount === RATE_LIMIT_MAX;
    return { allowed: true, isLastAllowed, previousSuppressed };
  }

  // Suppressed — record the job for the summary
  state.suppressedJobs.push({
    uri: job.uri,
    operation: job.operation,
    operationLabel: job.operation ? extractLabel(job.operation) : '',
    status: job.status,
    statusLabel: job.status ? extractLabel(job.status) : '',
    modified: job.modified,
  });

  console.log(
    `Rate limit reached for creator "${key}": suppressed alert for job <${job.uri}> ` +
      `(${state.suppressedJobs.length} suppressed in current window)`
  );

  return { allowed: false, isLastAllowed: false, previousSuppressed: [] };
}

/**
 * Get the current state of all rate limit windows (for diagnostics).
 */
export function getRateLimitStatus() {
  const status = {};
  const now = Date.now();
  for (const [key, state] of windows.entries()) {
    const remaining = Math.max(0, RATE_LIMIT_WINDOW_MS - (now - state.windowStart));
    status[key] = {
      emailCount: state.emailCount,
      suppressedCount: state.suppressedJobs.length,
      windowRemainingMs: remaining,
      windowRemainingMinutes: Math.ceil(remaining / 60000),
    };
  }
  return status;
}

/**
 * Reset all rate limit state.
 */
export function resetRateLimits() {
  windows.clear();
}
