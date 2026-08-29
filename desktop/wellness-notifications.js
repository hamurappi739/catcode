"use strict";

const WELLNESS_NOTIFICATION_COVER = "cover";
const WELLNESS_NOTIFICATION_COMPACT = "compact";
const WELLNESS_KINDS = new Set(["stretch", "drink"]);

function normalizeWellnessNotificationMode(value) {
  return value === WELLNESS_NOTIFICATION_COMPACT
    ? WELLNESS_NOTIFICATION_COMPACT
    : WELLNESS_NOTIFICATION_COVER;
}

function normalizeWellnessKind(value) {
  return WELLNESS_KINDS.has(value) ? value : "";
}

function normalizeWellnessInterval(value, fallback = 30, options = {}) {
  const min = Number.isFinite(options.min) ? options.min : 1;
  const max = Number.isFinite(options.max) ? options.max : 360;
  const parsed = Number(value);
  const fallbackValue = Number.isFinite(Number(fallback))
    ? Number(fallback)
    : min;
  const result = Number.isFinite(parsed) ? parsed : fallbackValue;
  return Math.max(min, Math.min(max, Math.round(result)));
}

function shouldUseCompactNotification({ automatic = false, mode } = {}) {
  return normalizeWellnessNotificationMode(mode) === WELLNESS_NOTIFICATION_COMPACT;
}

module.exports = {
  WELLNESS_NOTIFICATION_COVER,
  WELLNESS_NOTIFICATION_COMPACT,
  normalizeWellnessNotificationMode,
  normalizeWellnessKind,
  normalizeWellnessInterval,
  shouldUseCompactNotification,
};
