"use strict";

// Left-button pet drag, stretch release lifecycle, and context menu gating.

const DEFAULT_MAX_UP_OFFSET = 140;
const DEFAULT_DRAG_START_THRESHOLD_PX = 4;
const DEFAULT_PURR_LEAVE_GRACE_MS = 260;
const PURR_STROKE_MIN_DISTANCE_PX = 10;
const PURR_STROKE_WINDOW_MS = 450;

function createDragStretch({
  win = window,
  body = document.body,
  electronAPI = window.electronAPI,
  dragHandle,
  getStretchChain,
  isStretching,
  isCatHitPoint,
  isIdleHeadPoint,
  getPetPeekState,
  setPetMouseEventsEnabled,
  updateMouseEventPassthrough,
  clearMousePassthroughPoint,
  startPurring,
  scheduleStopPurring,
  stopPurring,
  stopHuntingPose,
  wakeSleeping,
  maxUpOffset = DEFAULT_MAX_UP_OFFSET,
  dragStartThresholdPx = DEFAULT_DRAG_START_THRESHOLD_PX,
  purrLeaveGraceMs = DEFAULT_PURR_LEAVE_GRACE_MS,
}) {
  let dragging = false;
  let releasing = false;
  let lastX = 0;
  let lastY = 0;
  let dragStartScreenY = 0;
  let dragGrabClientX = 0;
  let dragGrabClientY = 0;
  let pendingDragWindowMove = null;
  let dragWindowMoveRafId = null;
  let stretchT = 0;
  let pendingDrag = null;
  let lastDragMoveAt = 0;
  let pointerDownScreenX = 0;
  let pointerDownScreenY = 0;
  let purrStrokeAnchor = null;

  function isV4Model() {
    return body.dataset.catcodeModel === "v4";
  }

  function isStableVisualModel() {
    return isV4Model() || body.dataset.catcodeModel === "v6-idle-preview";
  }

  function stretchChain() {
    return getStretchChain && getStretchChain();
  }

  function startChain() {
    // Stage A: V4 keeps a complete idle silhouette while the window moves.
    // Legacy rubber-band stretch art (#stretch-svg-end) must not run.
    if (isStableVisualModel()) return;
    const chain = stretchChain();
    if (chain) chain.start();
  }

  function resetChainMotion() {
    if (isStableVisualModel()) return;
    const chain = stretchChain();
    if (chain) chain.resetMotion();
  }

  function applyChain() {
    if (isStableVisualModel()) return;
    const chain = stretchChain();
    if (chain) chain.apply();
  }

  function clearDraggingClass() {
    body.classList.remove("dragging");
    electronAPI.setStretchMode(false);
  }

  function flushDragWindowMove() {
    dragWindowMoveRafId = null;
    const move = pendingDragWindowMove;
    pendingDragWindowMove = null;
    if (!move) return;
    if (electronAPI.dragWindowTo) {
      electronAPI.dragWindowTo(
        move.screenX,
        move.screenY,
        dragGrabClientX,
        dragGrabClientY,
      );
    } else {
      electronAPI.dragWindow(move.dx, move.dy);
    }
  }

  function scheduleDragWindowMove(screenX, screenY, dx, dy) {
    pendingDragWindowMove = { screenX, screenY, dx, dy };
    if (dragWindowMoveRafId === null)
      dragWindowMoveRafId = requestAnimationFrame(flushDragWindowMove);
  }

  function beginDragStretch(startEvent, currentEvent = startEvent) {
    if (dragging || !startEvent || isStretching()) return;
    if (typeof wakeSleeping === "function") wakeSleeping();
    resetPurrStroke();
    stopPurring();
    stopHuntingPose();
    dragging = true;
    releasing = false;
    lastX = currentEvent.screenX;
    lastY = currentEvent.screenY;
    dragGrabClientX = startEvent.clientX;
    dragGrabClientY = startEvent.clientY;
    dragStartScreenY = startEvent.screenY;
    stretchT = 0;
    resetChainMotion();
    body.classList.add("dragging");
    electronAPI.setStretchMode(true);
    if (!isStableVisualModel()) startChain();
  }

  function clearPendingDrag() {
    pendingDrag = null;
  }

  function resetPurrStroke() {
    purrStrokeAnchor = null;
  }

  function isCompletedHeadStroke(event) {
    const now = Date.now();
    const point = { x: event.clientX, y: event.clientY, at: now };
    if (
      !purrStrokeAnchor ||
      now - purrStrokeAnchor.at > PURR_STROKE_WINDOW_MS
    ) {
      purrStrokeAnchor = point;
      return false;
    }

    const moved = Math.hypot(
      point.x - purrStrokeAnchor.x,
      point.y - purrStrokeAnchor.y,
    );
    if (moved < PURR_STROKE_MIN_DISTANCE_PX) return false;

    purrStrokeAnchor = point;
    return true;
  }

  function finishDragStretch(event) {
    clearPendingDrag();
    resetPurrStroke();
    if (dragging) {
      if (dragWindowMoveRafId !== null) {
        cancelAnimationFrame(dragWindowMoveRafId);
        flushDragWindowMove();
      }
      dragging = false;
      electronAPI.dragWindowEnded();
      // Stage A / V4: never enter stretch release — always clear dragging.
      if (!isStableVisualModel() && stretchT > 0) {
        releasing = true;
        startChain();
      } else {
        stretchT = 0;
        releasing = false;
        clearDraggingClass();
      }
    } else {
      dragging = false;
      // Belt-and-suspenders: stale class must never survive mouseup/blur.
      if (body.classList.contains("dragging") && !releasing) {
        stretchT = 0;
        clearDraggingClass();
      }
    }
    updateMouseEventPassthrough(event);
  }

  function handleWindowMouseDown(event) {
    pointerDownScreenX = event.screenX;
    pointerDownScreenY = event.screenY;
  }

  function handleDragHandleMouseDown(event) {
    if (!releasing && !isCatHitPoint(event.clientX, event.clientY)) return;
    if (getPetPeekState()) {
      if (event.button === 0 && electronAPI.unpeekPet) {
        electronAPI.unpeekPet();
        event.preventDefault();
      }
      return;
    }
    if (event.button === 0) {
      if (isStretching()) return;
      setPetMouseEventsEnabled(true);
      pendingDrag = {
        screenX: event.screenX,
        screenY: event.screenY,
        clientX: event.clientX,
        clientY: event.clientY,
        startedAt: Date.now(),
      };
      event.preventDefault();
    }
  }

  function handleWindowMouseMove(event) {
    const pointerMoved = Math.hypot(
      event.screenX - pointerDownScreenX,
      event.screenY - pointerDownScreenY,
    );
    if (event.buttons && pointerMoved > dragStartThresholdPx) {
      lastDragMoveAt = Date.now();
    }
    if (pendingDrag) {
      const pendingMoved = Math.hypot(
        event.screenX - pendingDrag.screenX,
        event.screenY - pendingDrag.screenY,
      );
      if (event.buttons & 1 && pendingMoved > dragStartThresholdPx) {
        beginDragStretch(pendingDrag, event);
        clearPendingDrag();
      } else if (!(event.buttons & 1)) {
        clearPendingDrag();
      }
    }
    // Dragging may start on any painted part of the cat, but purring needs a
    // real head stroke. Hovering is not enough, and paws, body, tail, or
    // empty space must never promote a V6 silhouette hit into purring.
    if (isIdleHeadPoint(event.clientX, event.clientY)) {
      if (isCompletedHeadStroke(event)) {
        startPurring(event.clientX, event.clientY);
      }
    } else if (!pendingDrag) {
      resetPurrStroke();
      scheduleStopPurring(purrLeaveGraceMs);
    }
    if (!dragging) return;
    if (!(event.buttons & 1)) {
      finishDragStretch(event);
      return;
    }
    const dx = event.screenX - lastX;
    const dy = event.screenY - lastY;
    if (dx !== 0 || dy !== 0) {
      lastDragMoveAt = Date.now();
      scheduleDragWindowMove(event.screenX, event.screenY, dx, dy);
      const chain = stretchChain();
      if (chain) chain.addPointerImpulse(dx);
      lastX = event.screenX;
      lastY = event.screenY;
    }

    const upOffset = dragStartScreenY - event.screenY;
    const tNow = Math.max(0, Math.min(1, upOffset / maxUpOffset));
    if (tNow > stretchT) stretchT = tNow;
  }

  function handleWindowMouseLeave() {
    clearMousePassthroughPoint();
    if (!dragging && !releasing && !pendingDrag)
      setPetMouseEventsEnabled(!!body.dataset.accountNudge);
    clearPendingDrag();
    resetPurrStroke();
    stopPurring();
  }

  function handleWindowBlur() {
    if (dragging) finishDragStretch();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    if (dragging || releasing || Date.now() - lastDragMoveAt < 350) return;
    electronAPI.showContextMenu({ online: navigator.onLine !== false });
  }

  function cancel() {
    dragging = false;
    pendingDrag = null;
    resetPurrStroke();
    releasing = false;
    stretchT = 0;
    stopPurring();
    stopHuntingPose();
    resetChainMotion();
    clearDraggingClass();
    applyChain();
    updateMouseEventPassthrough();
  }

  function bind() {
    win.addEventListener("mousedown", handleWindowMouseDown, { capture: true });
    dragHandle.addEventListener("mousedown", handleDragHandleMouseDown);
    win.addEventListener("mousemove", updateMouseEventPassthrough, {
      passive: true,
    });
    win.addEventListener("mousemove", handleWindowMouseMove);
    win.addEventListener("mouseup", finishDragStretch);
    win.addEventListener("mouseleave", handleWindowMouseLeave);
    win.addEventListener("blur", handleWindowBlur);
    win.addEventListener("contextmenu", handleContextMenu);
  }

  return {
    bind,
    cancel,
    getStretchT: () => stretchT,
    hasPendingDrag: () => !!pendingDrag,
    isActive: () => dragging || releasing || !!pendingDrag,
    isDragging: () => dragging,
    isReleasing: () => releasing,
    setReleasing: (nextReleasing) => {
      releasing = !!nextReleasing;
    },
    setStretchT: (nextStretchT) => {
      stretchT = nextStretchT;
    },
  };
}

module.exports = {
  createDragStretch,
};
