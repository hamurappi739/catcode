"use strict";

function isPointInsideBounds(point, bounds) {
  const x = Number(point && point.x);
  const y = Number(point && point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !bounds) return false;

  return (
    x >= bounds.x &&
    y >= bounds.y &&
    x < bounds.x + bounds.width &&
    y < bounds.y + bounds.height
  );
}

function createMenuDismissalController({
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  openGuardMs = 250,
  dismissDelayMs = 80,
} = {}) {
  let activeMenu = null;
  let activeWindow = null;
  let openedAt = 0;
  let dismissTimer = null;

  function clear(menu) {
    if (menu && menu !== activeMenu) return false;
    if (dismissTimer) clearTimer(dismissTimer);
    dismissTimer = null;
    activeMenu = null;
    activeWindow = null;
    openedAt = 0;
    return true;
  }

  function track(menu, browserWindow) {
    clear();
    activeMenu = menu || null;
    activeWindow = browserWindow || null;
    openedAt = now();
  }

  function dismissSoon() {
    if (!activeMenu || now() - openedAt < openGuardMs) return false;
    if (dismissTimer) return true;

    const menu = activeMenu;
    const browserWindow = activeWindow;
    dismissTimer = setTimer(() => {
      dismissTimer = null;
      if (activeMenu !== menu) return;
      try {
        menu.closePopup(browserWindow);
      } finally {
        clear(menu);
      }
    }, dismissDelayMs);
    return true;
  }

  return { clear, dismissSoon, track };
}

const globalMenuDismissal = createMenuDismissalController();

module.exports = {
  createMenuDismissalController,
  globalMenuDismissal,
  isPointInsideBounds,
};
