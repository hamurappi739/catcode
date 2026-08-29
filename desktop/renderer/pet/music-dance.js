"use strict";

(() => {
  // G-D3 state contract:
  // - data-music-active / data-music-dance = external music detected & dance-eligible
  //   (NOT proof that a V4 dance visual is on screen).
  // - data-v4-dance-active = an approved V4 dance pose/animation is actually running.
  //   V4 gaze blocks ONLY on data-v4-dance-active.
  // - Today no authored V4 dance renderer is wired (V4_DANCE_VISUAL_READY=false),
  //   so V4 never sets data-v4-dance-active and must not rely on legacy CSS hop.
  // Future dance integration: when an authored V4 dance visual starts, call
  // setV4DanceVisualActive(true); on stop/cleanup call setV4DanceVisualActive(false)
  // (also cleared by forceClearDance / music stop).

  const api = window.electronAPI;
  const body = document.body;
  const cat = document.getElementById("cat");
  const DANCE_VARIANTS = 3;
  const DANCE_CHANGE_MS = 5200;
  const DRAG_AUDIO_COOLDOWN_MS = 3200;
  // Must cover audio-activity AUDIBLE_HOLD_MS (350) so CatCode's own sounds
  // that the system meter heard cannot re-arm data-music-dance after release.
  const METER_ECHO_HOLD_MS = 800;
  // If main stops sending music-activity while last payload was active, clear.
  const STALE_ACTIVE_MS = 3600;
  const V6_ACTIVITY_POLL_MS = 500;
  /** Flip only when an approved V4 dance visual renderer is shipping. */
  const V4_DANCE_VISUAL_READY = false;
  let latest = { active: false, energy: 0, beat: false };
  let beatTimer = null;
  let variantTimer = null;
  let variant = 1;
  let beatCount = 0;
  let reportedActive = false;
  let wasDragging = body.classList.contains("dragging");
  let dragAudioCooldownUntil = 0;
  let dragAudioCooldownTimer = null;
  let internalAudioActive = false;
  let internalAudioUntil = 0;
  let internalAudioTimer = null;
  let echoSuppressUntil = 0;
  let echoSuppressTimer = null;
  let lastExternalActiveAt = 0;
  let staleActiveTimer = null;
  /** Explicit visual-active latch for future V4 dance (tests / future renderer). */
  let v4DanceVisualActive = false;
  let v6ActivityPoll = null;
  let forensicEnabled = false;

  function logForensic(source, payload) {
    if (!forensicEnabled) return;
    try {
      if (api && typeof api.danceForensicLog === "function") {
        api.danceForensicLog({ source, ...payload });
      }
    } catch (_) {}
  }

  const blockingAttributes = [
    "data-press",
    "data-scroll",
    "data-jump",
    "data-hunting",
    "data-hunting-return",
    "data-drinking",
    "data-stretching",
    "data-idle-sleep",
    "data-idle-wake",
    "data-purring",
    "data-pet-roaming",
    "data-pet-peek",
    "data-sharing",
  ];

  function isV4Model() {
    return body && body.dataset && body.dataset.catcodeModel === "v4";
  }

  function isV6Model() {
    return body && body.dataset && body.dataset.catcodeModel === "v6-idle-preview";
  }

  function catDocumentRoot() {
    try {
      return cat && cat.contentDocument && cat.contentDocument.documentElement;
    } catch {
      return null;
    }
  }

  function nowMs() {
    return Date.now();
  }

  function isEchoSuppressed() {
    return nowMs() < echoSuppressUntil;
  }

  function isInternalAudioActive() {
    return internalAudioActive || nowMs() < internalAudioUntil;
  }

  function isExternalMusicActive() {
    if (!latest.active) return false;
    if (isEchoSuppressed()) return false;
    if (lastExternalActiveAt > 0 && nowMs() - lastExternalActiveAt > STALE_ACTIVE_MS) {
      return false;
    }
    return true;
  }

  function canDance() {
    return (
      !document.hidden &&
      !body.classList.contains("dragging") &&
      nowMs() >= dragAudioCooldownUntil &&
      !isInternalAudioActive() &&
      isExternalMusicActive() &&
      !blockingAttributes.some((attribute) => body.hasAttribute(attribute))
    );
  }

  function danceBlockReasons() {
    const reasons = [];
    if (document.hidden) reasons.push("document-hidden");
    if (body.classList.contains("dragging")) reasons.push("dragging");
    if (nowMs() < dragAudioCooldownUntil) reasons.push("drag-cooldown");
    if (isInternalAudioActive()) reasons.push("internal-audio");
    if (isEchoSuppressed()) reasons.push("echo-suppress");
    if (!latest.active) reasons.push("meter-inactive");
    else if (!isExternalMusicActive()) reasons.push("external-stale");
    for (const attribute of blockingAttributes) {
      if (body.hasAttribute(attribute)) reasons.push(attribute);
    }
    return reasons;
  }

  /**
   * Legacy non-V4 may run CSS hop when music is eligible.
   * V4 must not run legacy hop / SVG dance-arm classes until V4_DANCE_VISUAL_READY.
   */
  function shouldRunLegacyDanceVisual() {
    return canDance() && !isV4Model() && !isV6Model();
  }

  function syncV6DanceVisual() {
    if (!isV6Model()) return;
    const dance = window.CatCodeV6Dance;
    if (!dance || typeof dance.syncMusicState !== "function") return;
    dance.syncMusicState({
      active: canDance(),
      energy: Math.max(0, Math.min(1, Number(latest.energy) || 0)),
      beat: !!latest.beat,
    });
  }

  function syncV4DanceVisualAttr({ allowTestLatch = false } = {}) {
    const ready = V4_DANCE_VISUAL_READY || allowTestLatch;
    const on =
      isV4Model() && ready && v4DanceVisualActive && canDance();
    body.toggleAttribute("data-v4-dance-active", on);
  }

  /**
   * Future V4 dance renderer entry point. No-op while V4_DANCE_VISUAL_READY is false
   * unless forceForTests is set (harness only).
   */
  function setV4DanceVisualActive(active, { forceForTests = false } = {}) {
    if (!forceForTests && !V4_DANCE_VISUAL_READY) {
      v4DanceVisualActive = false;
      syncV4DanceVisualAttr();
      return false;
    }
    v4DanceVisualActive = !!active;
    syncV4DanceVisualAttr({ allowTestLatch: !!forceForTests });
    return body.hasAttribute("data-v4-dance-active");
  }

  function scheduleEchoSuppressRelease() {
    if (echoSuppressTimer) clearTimeout(echoSuppressTimer);
    const delay = Math.max(0, echoSuppressUntil - nowMs());
    if (!delay) {
      echoSuppressTimer = null;
      sync();
      return;
    }
    echoSuppressTimer = setTimeout(() => {
      echoSuppressTimer = null;
      sync();
    }, delay + 10);
  }

  function armEchoSuppress(extraMs) {
    const hold = Math.max(0, Number(extraMs) || 0) + METER_ECHO_HOLD_MS;
    echoSuppressUntil = Math.max(echoSuppressUntil, nowMs() + hold);
    scheduleEchoSuppressRelease();
  }

  function scheduleInternalAudioRelease() {
    if (internalAudioTimer) clearTimeout(internalAudioTimer);
    const delay = Math.max(0, internalAudioUntil - nowMs());
    if (!delay) {
      internalAudioTimer = null;
      sync();
      return;
    }
    internalAudioTimer = setTimeout(() => {
      internalAudioTimer = null;
      sync();
    }, delay + 10);
  }

  function clearStaleActiveTimer() {
    if (!staleActiveTimer) return;
    clearTimeout(staleActiveTimer);
    staleActiveTimer = null;
  }

  function armStaleActiveTimer() {
    clearStaleActiveTimer();
    if (!latest.active) return;
    staleActiveTimer = setTimeout(() => {
      staleActiveTimer = null;
      if (!latest.active) return;
      if (nowMs() - lastExternalActiveAt <= STALE_ACTIVE_MS) {
        armStaleActiveTimer();
        return;
      }
      // Main/helper went quiet without an inactive payload — drop dance.
      latest = { active: false, energy: 0, beat: false };
      reportMusicActivity();
      sync();
    }, STALE_ACTIVE_MS + 40);
  }

  function handleInternalSound(event) {
    const detail = event && event.detail ? event.detail : {};
    if (typeof detail.active === "boolean") internalAudioActive = detail.active;
    const durationMs = Math.max(0, Number(detail.durationMs) || 0);
    if (durationMs) {
      internalAudioUntil = Math.max(internalAudioUntil, nowMs() + durationMs);
      scheduleInternalAudioRelease();
    }
    // Own meow/purr/reminder audio is heard by the system meter; suppress
    // dance for the sound window plus meter hold so loopback cannot arm it.
    armEchoSuppress(durationMs);
    if (typeof detail.active === "boolean" && detail.active) {
      armEchoSuppress(0);
    }
    // Drop any already-latched meter activity — it may be our own sound.
    if (latest.active) {
      latest = { active: false, energy: 0, beat: false };
      clearStaleActiveTimer();
      lastExternalActiveAt = 0;
      reportMusicActivity();
    }
    sync();
  }

  function syncDragTransition() {
    const dragging = body.classList.contains("dragging");
    if (wasDragging && !dragging) {
      dragAudioCooldownUntil = nowMs() + DRAG_AUDIO_COOLDOWN_MS;
      if (dragAudioCooldownTimer) clearTimeout(dragAudioCooldownTimer);
      dragAudioCooldownTimer = setTimeout(() => {
        dragAudioCooldownTimer = null;
        sync();
      }, DRAG_AUDIO_COOLDOWN_MS);
    }
    wasDragging = dragging;
  }

  function clearBeat() {
    if (beatTimer) clearTimeout(beatTimer);
    beatTimer = null;
    delete body.dataset.musicBeat;
  }

  function applyEmbeddedState(dancing) {
    const root = catDocumentRoot();
    if (!root) return;
    root.classList.toggle("music-dance", dancing);
    for (let index = 1; index <= DANCE_VARIANTS; index += 1) {
      root.classList.toggle(`music-dance-${index}`, dancing && index === variant);
    }
  }

  function applyVariant() {
    body.dataset.musicDanceVariant = String(variant);
    applyEmbeddedState(shouldRunLegacyDanceVisual());
  }

  function rotateVariant() {
    variant = (variant % DANCE_VARIANTS) + 1;
    beatCount = 0;
    applyVariant();
  }

  function stopVariantLoop() {
    if (variantTimer) clearTimeout(variantTimer);
    variantTimer = null;
    beatCount = 0;
  }

  function scheduleVariantChange() {
    if (variantTimer || !isExternalMusicActive()) return;
    // Variant rotation only drives legacy CSS hop visuals.
    if (isV4Model() && !V4_DANCE_VISUAL_READY) return;
    variantTimer = setTimeout(() => {
      variantTimer = null;
      if (!isExternalMusicActive()) return;
      rotateVariant();
      scheduleVariantChange();
    }, DANCE_CHANGE_MS);
  }

  function reportMusicActivity({ keepAwake = false } = {}) {
    const active = isExternalMusicActive();
    if (!keepAwake && reportedActive === active) return;
    reportedActive = active;
    window.dispatchEvent(
      new CustomEvent("catcode-music-activity", {
        detail: { active, energy: Number(latest.energy) || 0, beat: !!latest.beat },
      }),
    );
  }

  function sync() {
    const musicEligible = canDance();
    body.toggleAttribute("data-music-active", isExternalMusicActive());
    // Detection / eligibility signal — not proof of a V4 dance visual (G-D3).
    body.toggleAttribute("data-music-dance", musicEligible);
    const energy = Math.max(0, Math.min(1, Number(latest.energy) || 0));
    body.style.setProperty(
      "--music-dance-duration",
      `${(0.68 - energy * 0.28).toFixed(3)}s`,
    );
    const legacyVisual = shouldRunLegacyDanceVisual();
    applyEmbeddedState(legacyVisual);
    syncV4DanceVisualAttr();
    syncV6DanceVisual();
    logForensic("music-dance-sync", {
      model: body.dataset.catcodeModel || "",
      latched: body.dataset.catcodeModelLatched === "1",
      latestActive: !!latest.active,
      externalActive: isExternalMusicActive(),
      canDance: musicEligible,
      dataMusicActive: body.hasAttribute("data-music-active"),
      dataMusicDance: body.hasAttribute("data-music-dance"),
      energyBucket:
        !latest.active ? "0" : energy >= 0.5 ? "high" : energy >= 0.15 ? "mid" : "low",
      blockReasons: danceBlockReasons().join(","),
      v6Pose: body.dataset.v6Pose || "",
      danceStatus: body.dataset.v6DanceStatus || "",
    });
    if (isExternalMusicActive() && legacyVisual) scheduleVariantChange();
    else if (!isExternalMusicActive()) {
      stopVariantLoop();
      delete body.dataset.musicDanceVariant;
    } else if (isV4Model()) {
      stopVariantLoop();
    }
    if (!legacyVisual) clearBeat();
    if (!musicEligible && !v4DanceVisualActive) {
      body.removeAttribute("data-v4-dance-active");
    }
  }

  function applyState(state = {}) {
    // While CatCode audio may still be in the loopback, ignore active arms.
    if (state.active && isEchoSuppressed()) {
      latest = { active: false, energy: 0, beat: false };
      clearStaleActiveTimer();
      lastExternalActiveAt = 0;
      reportMusicActivity();
      sync();
      return;
    }
    latest = {
      active: !!state.active,
      energy: Number(state.energy) || 0,
      beat: !!state.beat,
    };
    if (latest.active) {
      lastExternalActiveAt = nowMs();
      armStaleActiveTimer();
    } else {
      clearStaleActiveTimer();
      lastExternalActiveAt = 0;
    }
    reportMusicActivity({ keepAwake: isExternalMusicActive() });
    sync();
    if (latest.active && latest.beat && shouldRunLegacyDanceVisual()) {
      beatCount += 1;
      if (beatCount >= 12) rotateVariant();
      clearBeat();
      body.dataset.musicBeat = "1";
      beatTimer = setTimeout(clearBeat, 150);
    }
  }

  // The normal IPC subscription below is the low-latency path. V6 additionally
  // pulls the current meter state so a missed push can never strand it in idle.
  function syncV6MusicSnapshot() {
    if (!isV6Model() || !api || typeof api.getMusicActivity !== "function") return;
    Promise.resolve(api.getMusicActivity())
      .then((state) => {
        if (isV6Model() && state && typeof state === "object") applyState(state);
      })
      .catch(() => {});
  }

  function startV6MusicSnapshotPolling() {
    if (v6ActivityPoll || !api || typeof api.getMusicActivity !== "function") return;
    syncV6MusicSnapshot();
    v6ActivityPoll = setInterval(syncV6MusicSnapshot, V6_ACTIVITY_POLL_MS);
  }

  function stopV6MusicSnapshotPolling() {
    if (!v6ActivityPoll) return;
    clearInterval(v6ActivityPoll);
    v6ActivityPoll = null;
  }

  function forceClearDance(reason) {
    void reason;
    latest = { active: false, energy: 0, beat: false };
    v4DanceVisualActive = false;
    clearStaleActiveTimer();
    lastExternalActiveAt = 0;
    reportMusicActivity();
    sync();
    body.removeAttribute("data-v4-dance-active");
  }

  new MutationObserver(() => {
    syncDragTransition();
    sync();
  }).observe(body, {
    attributes: true,
    attributeFilter: [...blockingAttributes, "class"],
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) forceClearDance("hidden");
    else sync();
  });
  window.addEventListener("pagehide", () => forceClearDance("pagehide"));
  window.addEventListener("catcode-internal-sound", handleInternalSound);
  cat?.addEventListener("load", () => {
    applyVariant();
    sync();
  });
  api?.onMusicActivity?.(applyState);
  startV6MusicSnapshotPolling();
  window.addEventListener("pagehide", stopV6MusicSnapshotPolling);

  if (api && typeof api.danceForensicEnabled === "function") {
    Promise.resolve(api.danceForensicEnabled())
      .then((info) => {
        forensicEnabled = !!(info && info.enabled);
        if (forensicEnabled) {
          logForensic("music-dance-sync", {
            boot: true,
            musicDanceEnabled: !!(info && info.musicDanceEnabled),
            musicMeterAvailable: !!(info && info.musicMeterAvailable),
            model: body.dataset.catcodeModel || "",
            latched: body.dataset.catcodeModelLatched === "1",
          });
        }
      })
      .catch(() => {
        forensicEnabled = false;
      });
  }

  // Test / diagnostics seam (no behavior when unused).
  window.CatCodeMusicDance = {
    applyState,
    sync,
    canDance,
    isExternalMusicActive,
    isEchoSuppressed,
    forceClearDance,
    handleInternalSound,
    setV4DanceVisualActive,
    shouldRunLegacyDanceVisual,
    isV4Model,
    isV6Model,
    V4_DANCE_VISUAL_READY,
    METER_ECHO_HOLD_MS,
    STALE_ACTIVE_MS,
    getLatest: () => ({ ...latest }),
    getEchoSuppressUntil: () => echoSuppressUntil,
    syncV6MusicSnapshot,
    isV4DanceVisualActive: () =>
      body.hasAttribute("data-v4-dance-active"),
  };
})();
