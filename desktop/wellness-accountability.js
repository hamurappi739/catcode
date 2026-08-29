"use strict";

const DEFAULT_ESCALATION_MS = 5 * 60 * 1000;
const DEFAULT_AWAY_THRESHOLD_MS = 45 * 1000;

function createWellnessAccountabilityController({
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  escalationMs = DEFAULT_ESCALATION_MS,
  awayThresholdMs = DEFAULT_AWAY_THRESHOLD_MS,
  getEnabled = () => true,
  onEscalate = () => {},
  onSatisfied = () => {},
} = {}) {
  let active = null;
  let timer = null;

  function clearActive(reason = "cancelled") {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    const previous = active;
    active = null;
    return previous ? { ...previous, reason } : null;
  }

  function finishSatisfied(reason) {
    const result = clearActive(reason);
    if (result) onSatisfied(result);
    return result;
  }

  function evaluate() {
    if (!active) return null;
    const currentTime = now();
    if (currentTime - active.lastActivityAt >= awayThresholdMs) {
      return finishSatisfied("away");
    }
    const result = clearActive("ignored");
    if (result) onEscalate(result);
    return result;
  }

  function start(payload = {}) {
    clearActive("replaced");
    if (!getEnabled()) return false;
    const startedAt = now();
    active = {
      kind: payload.kind === "drink" ? "drink" : "stretch",
      startedAt,
      lastActivityAt: startedAt,
    };
    timer = setTimer(evaluate, Math.max(1, escalationMs));
    return true;
  }

  function recordActivity(type = "input") {
    if (!active) return false;
    const currentTime = now();
    if (currentTime - active.lastActivityAt >= awayThresholdMs) {
      finishSatisfied("away");
      return false;
    }
    active.lastActivityAt = currentTime;
    active.lastActivityType = type;
    return true;
  }

  function cancel(reason = "cancelled") {
    return !!clearActive(reason);
  }

  function getState() {
    return active ? { ...active } : null;
  }

  return { start, recordActivity, cancel, getState, evaluate };
}

module.exports = {
  DEFAULT_ESCALATION_MS,
  DEFAULT_AWAY_THRESHOLD_MS,
  createWellnessAccountabilityController,
};
