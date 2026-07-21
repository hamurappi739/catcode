"use strict";

function createRateLimiter({ windowMs = 10 * 60 * 1000, clock = Date.now } = {}) {
  const buckets = new Map();

  function take(key, limit) {
    const now = clock();
    const bucket = buckets.get(key) || [];
    const fresh = bucket.filter((timestamp) => timestamp > now - windowMs);
    if (fresh.length >= limit) {
      buckets.set(key, fresh);
      return false;
    }
    fresh.push(now);
    buckets.set(key, fresh);
    return true;
  }

  return { take };
}

module.exports = { createRateLimiter };
