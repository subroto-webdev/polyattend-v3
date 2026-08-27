// Simple in-memory rate limiter for sensitive auth endpoints
// (login, OTP verify, password reset, registration).
//
// NOTE ON SERVERLESS: this uses a plain in-memory Map, so it only limits
// requests handled by the SAME warm serverless instance/process — it does
// NOT share state across multiple instances (e.g. multiple Vercel lambda
// invocations, or a multi-replica deployment). That's still useful (it
// stops a single hot loop / naive script from one instance) but it is NOT
// a hard guarantee against a distributed attacker. For a real production
// guarantee, replace the store below with a shared store such as Upstash
// Redis (`@upstash/ratelimit`) — the `hit()` function is the only place
// that would need to change.

const buckets = new Map();

// Periodically clear out old buckets so this doesn't grow forever.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();
function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > bucket.windowMs) buckets.delete(key);
  }
}

/**
 * Records a hit for `key` and returns whether it's allowed.
 * @param {string} key - unique identifier, e.g. `login:<ip>:<email>`
 * @param {number} limit - max hits allowed within the window
 * @param {number} windowMs - window size in ms
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function hit(key, limit, windowMs) {
  const now = Date.now();
  sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { windowStart: now, windowMs, count: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterMs = Math.max(0, bucket.windowStart + windowMs - now);
  return { allowed, remaining, retryAfterMs };
}

/**
 * Best-effort client IP extraction behind a proxy/load balancer
 * (Vercel, most reverse proxies). Falls back to a constant so
 * rate limiting still works (shared bucket) even if no IP header
 * is present, rather than silently no-op'ing.
 */
export function getClientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/**
 * Convenience wrapper: rate-limit by IP + an optional identifier
 * (e.g. the email being logged into), so one IP can't hammer a
 * single account, AND a distributed attacker can't hammer one
 * account from many IPs beyond a looser global cap.
 *
 * Returns null if allowed, or a NextResponse-ready payload if blocked:
 *   { blocked: true, message, retryAfterSeconds }
 */
export function checkRateLimit(request, routeName, identifier, { limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const ip = getClientIp(request);
  const perIpKey = `${routeName}:ip:${ip}`;
  const perIpResult = hit(perIpKey, limit, windowMs);

  if (!perIpResult.allowed) {
    return {
      blocked: true,
      message: 'Too many attempts. Please try again later.',
      retryAfterSeconds: Math.ceil(perIpResult.retryAfterMs / 1000),
    };
  }

  if (identifier) {
    // Slightly looser cap per-identifier (e.g. per-email) than per-IP,
    // since legitimate shared IPs (campus wifi, office NAT) hit the
    // per-IP bucket faster across many different users.
    const perIdKey = `${routeName}:id:${String(identifier).toLowerCase()}`;
    const perIdResult = hit(perIdKey, limit * 2, windowMs);
    if (!perIdResult.allowed) {
      return {
        blocked: true,
        message: 'Too many attempts for this account. Please try again later.',
        retryAfterSeconds: Math.ceil(perIdResult.retryAfterMs / 1000),
      };
    }
  }

  return null;
}
