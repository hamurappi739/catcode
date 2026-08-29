"use strict";

/**
 * Temporary global feature gate for water / drink reminders.
 * Settings and intervals remain stored; only runtime scheduling/UI activation
 * is suppressed until a separate audit re-enables this flag.
 */
const WATER_REMINDERS_TEMPORARILY_DISABLED = false;

function areWaterRemindersTemporarilyDisabled() {
  return WATER_REMINDERS_TEMPORARILY_DISABLED === true;
}

module.exports = {
  WATER_REMINDERS_TEMPORARILY_DISABLED,
  areWaterRemindersTemporarilyDisabled,
};
