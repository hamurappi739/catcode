"use strict";

const {
  areWaterRemindersTemporarilyDisabled,
} = require("./water-reminders-gate");
const { shouldUseCompactNotification } = require("./wellness-notifications");

const QUEUE_FLUSH_MS = 900;

function createCoveringMotionController({
  screen,
  getPetPeekState,
  getPetWindow,
  boundsWithConstrainedPetPosition,
  setCurrentPetPosition,
  saveSettings,
  broadcastPetSize,
  getPeekStretchEnabled,
  getPeekDrinkEnabled,
  getStretchNotificationMode: stretchModeGet,
  getDrinkNotificationMode: drinkModeGet,
  startStretchAccountability,
  unpeekPet,
  peekPet,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let stretchActive = false;
  let stretchRestoreBounds = null;
  let stretchStartTimer = null;
  let stretchEndTimer = null;
  let drinkActive = false;
  let drinkRestoreBounds = null;
  let drinkStartTimer = null;
  let drinkEndTimer = null;
  let pomodoroActive = false;
  let pomodoroRestoreBounds = null;
  let pomodoroStartTimer = null;
  let pomodoroEndTimer = null;
  let wellnessCompactKind = "";
  let wellnessAwaitingAcknowledgement = "";
  let queue = [];
  let queueTimer = null;
  let pendingPeekEdge = null;

  function enqueue(kind, options = {}) {
    if (kind === "drink" && areWaterRemindersTemporarilyDisabled()) return;
    if (kind === "drink" && wellnessAwaitingAcknowledgement === "drink") return;
    if (kind === "stretch" && wellnessAwaitingAcknowledgement === "stretch") return;
    if (queue.some((item) => item.kind === kind)) return;
    queue.push({ kind, options });
  }

  function peekEnabled(kind) {
    const getter = kind === "stretch" ? getPeekStretchEnabled : getPeekDrinkEnabled;
    return typeof getter === "function" ? !!getter() : false;
  }

  function wellnessBusy() {
    return !!(
      stretchActive ||
      drinkActive ||
      wellnessCompactKind ||
      wellnessAwaitingAcknowledgement
    );
  }

  function isPeeked() {
    return !!getPetPeekState() || !!pendingPeekEdge;
  }

  function unpeekIfNeeded() {
    const peek = getPetPeekState();
    if (peek) {
      pendingPeekEdge = pendingPeekEdge || peek.edge || "left";
      if (typeof unpeekPet === "function") unpeekPet();
    }
  }

  function restorePeekIfNeeded() {
    if (!(queue.length > 0 || queueTimer) && pendingPeekEdge && typeof peekPet === "function") {
      const edge = pendingPeekEdge;
      pendingPeekEdge = null;
      peekPet(edge);
    }
  }

  function clearQueue() {
    queue = [];
    if (queueTimer) {
      clearTimer(queueTimer);
      queueTimer = null;
    }
  }

  function discardQueuedKind(kind) {
    queue = queue.filter((item) => item.kind !== kind);
    if (queueTimer) {
      clearTimer(queueTimer);
      queueTimer = null;
    }
  }

  function flushQueue() {
    if (queueTimer) {
      clearTimer(queueTimer);
      queueTimer = null;
    }
    if (queue.length === 0) return;
    const next = queue.shift();
    queueTimer = setTimer(() => {
      queueTimer = null;
      if (next.kind === "stretch") {
        triggerStretchSequence(next.options);
      } else if (next.kind === "drink") {
        if (areWaterRemindersTemporarilyDisabled()) flushQueue();
        else triggerDrinkSequence(next.options);
      }
    }, QUEUE_FLUSH_MS);
  }

  function clearStretchTimers() {
    if (stretchStartTimer) clearTimer(stretchStartTimer);
    if (stretchEndTimer) clearTimer(stretchEndTimer);
    stretchStartTimer = null;
    stretchEndTimer = null;
  }

  function finishStretch(options = {}) {
    const window = getPetWindow();
    clearStretchTimers();
    if (
      window &&
      !window.isDestroyed() &&
      options.cancelRenderer &&
      window.webContents &&
      stretchRestoreBounds
    ) {
      const restored = boundsWithConstrainedPetPosition(stretchRestoreBounds);
      window.setBounds(restored, true);
      setCurrentPetPosition({ x: restored.x, y: restored.y });
      saveSettings({ sync: false });
      window.webContents.send("cancel-stretch");
    }
    stretchActive = false;
    stretchRestoreBounds = null;
    if (options.cancelRenderer && !options.preserveQueue) {
      clearQueue();
    } else if (!options.waitForAcknowledgement) {
      flushQueue();
    }
    if (!options.waitForAcknowledgement) restorePeekIfNeeded();
  }

  function cancelStretch() {
    return stretchActive ? (finishStretch({ cancelRenderer: true }), true) : false;
  }

  function clearDrinkTimers() {
    if (drinkStartTimer) clearTimer(drinkStartTimer);
    if (drinkEndTimer) clearTimer(drinkEndTimer);
    drinkStartTimer = null;
    drinkEndTimer = null;
  }

  function finishDrink(options = {}) {
    const window = getPetWindow();
    clearDrinkTimers();
    if (
      window &&
      !window.isDestroyed() &&
      options.cancelRenderer &&
      window.webContents &&
      drinkRestoreBounds
    ) {
      const restored = boundsWithConstrainedPetPosition(drinkRestoreBounds);
      window.setBounds(restored, true);
      setCurrentPetPosition({ x: restored.x, y: restored.y });
      saveSettings({ sync: false });
      window.webContents.send("cancel-drink");
    }
    drinkActive = false;
    drinkRestoreBounds = null;
    if (options.cancelRenderer && !options.preserveQueue) {
      clearQueue();
    } else if (!options.waitForAcknowledgement) {
      flushQueue();
    }
    if (!options.waitForAcknowledgement) restorePeekIfNeeded();
  }

  function cancelDrink() {
    return drinkActive ? (finishDrink({ cancelRenderer: true }), true) : false;
  }

  function clearPomodoroTimers() {
    if (pomodoroStartTimer) clearTimer(pomodoroStartTimer);
    if (pomodoroEndTimer) clearTimer(pomodoroEndTimer);
    pomodoroStartTimer = null;
    pomodoroEndTimer = null;
  }

  function finishPomodoro(options = {}) {
    const window = getPetWindow();
    clearPomodoroTimers();
    if (
      window &&
      !window.isDestroyed() &&
      options.cancelRenderer &&
      window.webContents &&
      pomodoroRestoreBounds
    ) {
      const restored = boundsWithConstrainedPetPosition(pomodoroRestoreBounds);
      window.setBounds(restored, true);
      setCurrentPetPosition({ x: restored.x, y: restored.y });
      broadcastPetSize();
      saveSettings({ sync: false });
      window.webContents.send("cancel-pomodoro-motion");
    }
    pomodoroActive = false;
    pomodoroRestoreBounds = null;
    if (options.cancelRenderer) clearQueue();
    else flushQueue();
    restorePeekIfNeeded();
  }

  function cancelPomodoro() {
    return pomodoroActive ? (finishPomodoro({ cancelRenderer: true }), true) : false;
  }

  function cancelCoveringMotion() {
    const window = getPetWindow();
    const cancelledStretch = cancelStretch();
    const cancelledDrink = cancelDrink();
    const cancelledPomodoro = cancelPomodoro();
    if (window && !window.isDestroyed() && window.webContents) {
      window.webContents.send("cancel-pomodoro-motion");
    }
    return cancelledStretch || cancelledDrink || cancelledPomodoro;
  }

  function triggerStretchSequence(options = {}) {
    const window = getPetWindow();
    if (!window || window.isDestroyed()) return;
    if (pomodoroActive || stretchActive || drinkActive || wellnessBusy()) {
      enqueue("stretch", options);
      return;
    }
    if (options.automatic && window.isVisible() && typeof startStretchAccountability === "function") {
      startStretchAccountability({ kind: "stretch" });
    }
    if (options.automatic) {
      wellnessAwaitingAcknowledgement = "stretch";
      window.webContents.send("wellness-prompt", { kind: "stretch" });
    }
    if (
      shouldUseCompactNotification({
        automatic: !!options.automatic,
        mode: typeof stretchModeGet === "function" ? stretchModeGet() : "cover",
      })
    ) {
      unpeekIfNeeded();
      if (options.automatic) wellnessCompactKind = "stretch";
      window.webContents.send("wellness-notification", { kind: "stretch" });
      return;
    }
    unpeekIfNeeded();
    clearStretchTimers();
    stretchActive = true;
    stretchRestoreBounds = window.getBounds();
    const display = screen.getDisplayMatching(stretchRestoreBounds);
    const { x, y, width, height } = display.workArea;
    const size = Math.round(height * 0.7);
    window.setBounds(
      {
        x: x + Math.round((width - size) / 2),
        y: y + Math.round((height - size) / 2),
        width: size,
        height: size,
      },
      true,
    );
    stretchStartTimer = setTimer(() => {
      stretchStartTimer = null;
      if (window && !window.isDestroyed() && window.webContents) {
        window.webContents.send("do-stretch");
      }
    }, 400);
    stretchEndTimer = setTimer(() => {
      finishStretch({
        cancelRenderer: true,
        waitForAcknowledgement: !!options.automatic,
      });
    }, 3600);
  }

  function triggerDrinkSequence(options = {}) {
    if (areWaterRemindersTemporarilyDisabled()) return;
    const window = getPetWindow();
    if (!window || window.isDestroyed()) return;
    if (drinkActive || stretchActive || pomodoroActive || wellnessBusy()) {
      enqueue("drink", options);
      return;
    }
    if (options.automatic) {
      wellnessAwaitingAcknowledgement = "drink";
      window.webContents.send("wellness-prompt", { kind: "drink" });
    }
    if (
      shouldUseCompactNotification({
        automatic: !!options.automatic,
        mode: typeof drinkModeGet === "function" ? drinkModeGet() : "cover",
      })
    ) {
      unpeekIfNeeded();
      if (options.automatic) wellnessCompactKind = "drink";
      window.webContents.send("wellness-notification", { kind: "drink" });
      return;
    }
    unpeekIfNeeded();
    clearDrinkTimers();
    drinkActive = true;
    drinkRestoreBounds = window.getBounds();
    const display = screen.getDisplayMatching(drinkRestoreBounds);
    const { x, y, width, height } = display.workArea;
    const size = Math.round(height * 0.7);
    window.setBounds(
      {
        x: x + Math.round((width - size) / 2),
        y: y + Math.round((height - size) / 2),
        width: size,
        height: size,
      },
      true,
    );
    drinkStartTimer = setTimer(() => {
      drinkStartTimer = null;
      if (window && !window.isDestroyed() && window.webContents) {
        window.webContents.send("do-drink");
      }
    }, 400);
    drinkEndTimer = setTimer(() => {
      finishDrink({
        cancelRenderer: true,
        waitForAcknowledgement: !!options.automatic,
      });
    }, 3600);
  }

  function completeWellnessNotification(kind) {
    if (kind !== "stretch" && kind !== "drink") return false;
    if (wellnessAwaitingAcknowledgement !== kind && wellnessCompactKind !== kind) return false;
    wellnessAwaitingAcknowledgement = "";
    if (wellnessCompactKind === kind) wellnessCompactKind = "";
    if (kind === "stretch" && stretchActive) {
      finishStretch({ cancelRenderer: true, preserveQueue: true });
    }
    if (kind === "drink" && drinkActive) {
      finishDrink({ cancelRenderer: true, preserveQueue: true });
    }
    if (kind === "drink") {
      discardQueuedKind("drink");
    } else {
      flushQueue();
    }
    restorePeekIfNeeded();
    return true;
  }

  function triggerPomodoroFocusStartSequence() {
    const window = getPetWindow();
    if (isPeeked() || !window || window.isDestroyed() || pomodoroActive || stretchActive || drinkActive) {
      return;
    }
    pomodoroActive = true;
    pomodoroRestoreBounds = window.getBounds();
    const display = screen.getDisplayMatching(pomodoroRestoreBounds);
    const { x, y, width, height } = display.workArea;
    const size = Math.round(height * 0.7);
    window.setBounds(
      {
        x: x + Math.round((width - size) / 2),
        y: y + Math.round((height - size) / 2),
        width: size,
        height: size,
      },
      true,
    );
    broadcastPetSize(Math.round(size * 0.42));
    pomodoroStartTimer = setTimer(() => {
      pomodoroStartTimer = null;
      if (window && !window.isDestroyed() && window.webContents) {
        window.webContents.send("pomodoro-focus-start");
      }
    }, 160);
    pomodoroEndTimer = setTimer(() => {
      finishPomodoro();
    }, 1400);
  }

  function triggerJumpSequence() {
    const window = getPetWindow();
    if (isPeeked() || !window || window.isDestroyed() || !window.webContents) return;
    window.webContents.send("do-jump");
  }

  return {
    cancelCoveringMotion,
    completeWellnessNotification,
    triggerStretchSequence,
    triggerDrinkSequence,
    triggerPomodoroFocusStartSequence,
    triggerJumpSequence,
    // Test hooks
    _getQueue: () => queue.slice(),
    _getAwaitingAcknowledgement: () => wellnessAwaitingAcknowledgement,
    _getCompactKind: () => wellnessCompactKind,
  };
}

module.exports = {
  QUEUE_FLUSH_MS,
  createCoveringMotionController,
};
