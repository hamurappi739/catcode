"use strict";

// Product-specific behavior kept outside the recovered renderer bundle.
// It only uses the trusted preload API and DOM nodes owned by the pet window.

(() => {
  const api = window.electronAPI;
  const cat = document.getElementById("cat");
  const wellnessCompleteButton = document.getElementById("cat-wellness-complete");
  const reminderAcknowledgement = document.getElementById("cat-reminder-ack");
  const reminderAcknowledgementText = document.getElementById("cat-reminder-ack-text");
  const reminderAcknowledgementButton = document.getElementById("cat-reminder-ack-button");
  if (
    !api ||
    !cat ||
    !wellnessCompleteButton ||
    !reminderAcknowledgement ||
    !reminderAcknowledgementText ||
    !reminderAcknowledgementButton
  ) {
    return;
  }

  const ATTENTION_SOUND_INTERVAL_MS = 8000;
  const previewSound = new Audio("../../assets/sound/meow.m4a");
  const attentionSound = new Audio("../../assets/sound/meow-alert.m4a");
  let volume = 0.65;
  let muted = false;
  let language = "en";
  let attentionEnabled = true;
  let attentionIntervalMin = 60;
  let attentionActive = false;
  let sleeping = document.body.hasAttribute("data-idle-sleep");
  let attentionTimer = null;
  let attentionSoundTimer = null;
  let purring = document.body.hasAttribute("data-purring");

  for (const audio of [previewSound, attentionSound]) {
    audio.preload = "auto";
  }

  const attentionMessage = document.createElement("div");
  attentionMessage.id = "cat-attention-request";
  attentionMessage.setAttribute("role", "status");
  attentionMessage.hidden = true;
  document.body.appendChild(attentionMessage);

  let wellnessPromptKind = "";
  let deferredReminderText = "";

  const style = document.createElement("style");
  style.textContent = `
    #cat-attention-request {
      position: absolute;
      left: 50%;
      bottom: calc(100% - var(--cat-top) + 5px);
      z-index: 8;
      max-width: min(92vw, 260px);
      padding: 7px 9px;
      transform: translateX(-50%);
      border: 2px solid #111;
      background: #fff6bd;
      color: #111;
      box-shadow: 3px 3px 0 #111;
      font: 700 13px/1.2 "Galmuri11", "Silkscreen", Monaco, monospace;
      text-align: center;
      pointer-events: none;
      animation: cat-attention-pop 1s steps(2, end) 3;
    }
    #cat-attention-request::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -9px;
      width: 12px;
      height: 10px;
      transform: translateX(-50%);
      background: #fff6bd;
      clip-path: polygon(0 0, 100% 0, 50% 100%);
    }
    body[data-pet-peek] #cat-attention-request {
      width: min(112px, calc(100vw - 8px));
      max-width: none;
      box-sizing: border-box;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    body[data-pet-peek="left"] #cat-attention-request {
      left: 78%;
    }
    body[data-pet-peek="right"] #cat-attention-request {
      left: 22%;
    }
    #cat-wellness-complete {
      position: absolute;
      left: 50%;
      /* Keep the acknowledgement above the spoken reminder. The old anchor
         occupied the same head slot as the red speech bubble. */
      bottom: calc(100% - var(--cat-top) + 36px);
      z-index: 9;
      max-width: min(92vw, 230px);
      padding: 8px 10px;
      transform: translateX(-50%);
      border: 2px solid #111;
      border-radius: 0;
      background: #38bd70;
      color: #111;
      box-shadow: 3px 3px 0 #111;
      font: 700 13px/1.1 "Galmuri11", "Silkscreen", Monaco, monospace;
      cursor: pointer;
      pointer-events: auto;
      -webkit-app-region: no-drag;
    }
    #cat-wellness-complete:hover { background: #65dd94; }
    body[data-pet-peek] #cat-wellness-complete {
      width: min(112px, calc(100vw - 8px));
      max-width: none;
      box-sizing: border-box;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    body[data-pet-peek="left"] #cat-wellness-complete { left: 78%; }
    body[data-pet-peek="right"] #cat-wellness-complete { left: 22%; }
    #cat-reminder-ack {
      position: absolute;
      left: 50%;
      bottom: calc(100% - var(--cat-top) + 36px);
      z-index: 9;
      display: flex;
      width: min(92vw, 280px);
      box-sizing: border-box;
      flex-direction: column;
      gap: 7px;
      padding: 8px;
      transform: translateX(-50%);
      border: 2px solid #111;
      background: #fff6bd;
      color: #111;
      box-shadow: 3px 3px 0 #111;
      font: 700 13px/1.2 "Galmuri11", "Silkscreen", Monaco, monospace;
      text-align: center;
      pointer-events: auto;
      -webkit-app-region: no-drag;
    }
    #cat-reminder-ack[hidden] { display: none; }
    #cat-reminder-ack-button {
      min-height: 30px;
      border: 1px solid #111;
      border-radius: 0;
      background: #fff;
      color: #111;
      font: inherit;
      cursor: pointer;
    }
    #cat-reminder-ack-button:hover { background: #e7e7e7; }
    body[data-pet-peek] #cat-reminder-ack {
      width: min(112px, calc(100vw - 8px));
      max-width: none;
      overflow-wrap: anywhere;
    }
    body[data-pet-peek="left"] #cat-reminder-ack { left: 78%; }
    body[data-pet-peek="right"] #cat-reminder-ack { left: 22%; }
    @keyframes cat-attention-pop {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(-3px); }
    }
  `;
  document.head.appendChild(style);

  function normalizeVolume(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function signalInternalSound({ active, durationMs = 0 } = {}) {
    const detail = { durationMs: Math.max(0, Number(durationMs) || 0) };
    if (typeof active === "boolean") detail.active = active;
    window.dispatchEvent(
      new CustomEvent("catcode-internal-sound", {
        detail,
      }),
    );
  }

  function copyPlay(audio, nextVolume, { restart = true } = {}) {
    if (!audio || nextVolume <= 0) return;
    signalInternalSound({ durationMs: 2400 });
    audio.volume = nextVolume;
    if (restart) audio.currentTime = 0;
    audio.play().catch((error) => {
      console.warn("[CatCode] sound playback failed", error && error.message);
    });
  }

  function stopAttentionSound() {
    attentionSound.pause();
    attentionSound.currentTime = 0;
  }

  function attentionDelay() {
    return Math.max(1, Math.min(240, Math.round(attentionIntervalMin))) * 60 * 1000;
  }

  function translateAttentionMessage() {
    return language === "ru" ? "Погладь меня, пожалуйста" : "Pet me, please";
  }

  function clearAttentionSoundTimer() {
    if (attentionSoundTimer) clearInterval(attentionSoundTimer);
    attentionSoundTimer = null;
  }

  function wellnessCompleteLabel(kind) {
    if (language === "ru") {
      return kind === "drink" ? "Хорошо" : "Готово";
    }
    return kind === "drink" ? "Okay" : "Done";
  }

  function hideWellnessPrompt() {
    wellnessPromptKind = "";
    wellnessCompleteButton.hidden = true;
    if (deferredReminderText) {
      const text = deferredReminderText;
      deferredReminderText = "";
      showReminderAcknowledgement({ text });
    }
  }

  function showWellnessPrompt(payload = {}) {
    if (attentionActive) stopAttention({ reschedule: false });
    if (!reminderAcknowledgement.hidden) {
      deferredReminderText = reminderAcknowledgementText.textContent || "";
      hideReminderAcknowledgement();
    }
    wellnessPromptKind = payload.kind === "drink" ? "drink" : "stretch";
    wellnessCompleteButton.textContent = wellnessCompleteLabel(wellnessPromptKind);
    wellnessCompleteButton.hidden = false;
  }

  function reminderAcknowledgementLabel() {
    return language === "ru" ? "Понятно" : "Got it";
  }

  function showReminderAcknowledgement(payload = {}) {
    const text = String(payload.text || "").trim();
    if (!text) return;
    if (wellnessPromptKind) {
      deferredReminderText = text;
      return;
    }
    reminderAcknowledgementText.textContent = text;
    reminderAcknowledgementButton.textContent = reminderAcknowledgementLabel();
    reminderAcknowledgement.hidden = false;
  }

  function hideReminderAcknowledgement() {
    reminderAcknowledgement.hidden = true;
    reminderAcknowledgementText.textContent = "";
  }

  function playAttentionSound() {
    if (muted || !attentionActive) return;
    copyPlay(attentionSound, volume);
  }

  function scheduleAttention() {
    if (attentionTimer) clearTimeout(attentionTimer);
    attentionTimer = null;
    if (!attentionEnabled || attentionActive || sleeping) return;
    attentionTimer = setTimeout(startAttention, attentionDelay());
  }

  function stopAttention({ reschedule = true } = {}) {
    attentionActive = false;
    attentionMessage.hidden = true;
    delete document.body.dataset.attentionRequest;
    clearAttentionSoundTimer();
    stopAttentionSound();
    if (reschedule) scheduleAttention();
  }

  function startAttention() {
    attentionTimer = null;
    if (!attentionEnabled || attentionActive || sleeping) return;
    attentionActive = true;
    attentionMessage.textContent = translateAttentionMessage();
    attentionMessage.hidden = false;
    document.body.dataset.attentionRequest = "1";
    playAttentionSound();
    attentionSoundTimer = setInterval(playAttentionSound, ATTENTION_SOUND_INTERVAL_MS);
  }

  function isCatHeadPoint(event) {
    // V4: any currently painted opaque pixel of the live #cat. Prefer the shared
    // opaque hit helper so attention dismissal matches petting/drag.
    if (
      document.body &&
      document.body.dataset &&
      document.body.dataset.catcodeModel === "v4"
    ) {
      const hit = window.CatCodeV4HitTest;
      if (hit && typeof hit.isOpaqueHit === "function") {
        return hit.isOpaqueHit(cat, event.clientX, event.clientY);
      }
      if (hit && typeof hit.isCatHitPoint === "function") {
        return hit.isCatHitPoint(event.clientX, event.clientY);
      }
    }
    const bounds = cat.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      return false;
    }
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const dx = (x - 0.4) / 0.25;
    const dy = (y - 0.33) / 0.23;
    return dx * dx + dy * dy <= 1;
  }

  function handlePetting(event) {
    if (!isCatHeadPoint(event)) return;
    if (attentionActive) stopAttention();
  }

  // The native interaction is a cursor stroke over the head. It deliberately
  // does not require a click because the pet window is mostly transparent.
  window.addEventListener("mousemove", handlePetting, true);
  document.addEventListener("pointerdown", handlePetting, true);

  const sleepObserver = new MutationObserver(() => {
    const nextSleeping = document.body.hasAttribute("data-idle-sleep");
    const nextPurring = document.body.hasAttribute("data-purring");
    if (purring !== nextPurring) {
      purring = nextPurring;
      signalInternalSound({ active: purring, durationMs: purring ? 0 : 900 });
    }
    api.setPetSleepState && api.setPetSleepState(nextSleeping);
    if (sleeping === nextSleeping) return;
    sleeping = nextSleeping;
    if (sleeping) {
      if (attentionTimer) clearTimeout(attentionTimer);
      attentionTimer = null;
      stopAttention({ reschedule: false });
      return;
    }
    scheduleAttention();
  });
  sleepObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-idle-sleep", "data-purring"],
  });
  api.setPetSleepState && api.setPetSleepState(sleeping);

  api.onSoundPreview &&
    api.onSoundPreview((payload) => {
      const previewVolume = normalizeVolume(payload && payload.volume);
      copyPlay(previewSound, previewVolume);
    });
  api.onTaskCompleteSoundVolume &&
    api.onTaskCompleteSoundVolume((nextVolume) => {
      volume = normalizeVolume(nextVolume);
      for (const audio of [previewSound, attentionSound]) {
        audio.volume = volume;
      }
    });
  api.onSoundMuted &&
    api.onSoundMuted((nextMuted) => {
      muted = !!nextMuted;
      if (muted) {
        stopAttentionSound();
      }
    });
  api.onAttentionRequestsEnabled &&
    api.onAttentionRequestsEnabled((enabled) => {
      attentionEnabled = !!enabled;
      stopAttention({ reschedule: attentionEnabled });
    });
  api.onAttentionRequestInterval &&
    api.onAttentionRequestInterval((minutes) => {
      attentionIntervalMin = Math.max(
        1,
        Math.min(240, Math.round(Number(minutes) || 60)),
      );
      if (attentionEnabled && !attentionActive && !sleeping) scheduleAttention();
    });
  api.onWellnessPrompt && api.onWellnessPrompt(showWellnessPrompt);
  api.onReminderTriggered && api.onReminderTriggered(showReminderAcknowledgement);
  api.onLanguageChanged &&
    api.onLanguageChanged((nextLanguage) => {
      language = String(nextLanguage || "en").toLowerCase().split("-")[0];
      if (attentionActive) attentionMessage.textContent = translateAttentionMessage();
      if (wellnessPromptKind) {
        wellnessCompleteButton.textContent = wellnessCompleteLabel(wellnessPromptKind);
      }
      reminderAcknowledgementButton.textContent = reminderAcknowledgementLabel();
    });

  wellnessCompleteButton.addEventListener("click", async () => {
    const kind = wellnessPromptKind;
    if (!kind || !api.wellnessComplete) return;
    wellnessCompleteButton.disabled = true;
    try {
      const result = await api.wellnessComplete({ kind });
      // Hide only after main has accepted the acknowledgement and re-armed
      // the relevant interval. Otherwise the visible prompt remains retryable.
      if (result && result.ok === true) {
        hideWellnessPrompt();
      } else {
        console.warn("[CatCode] wellness acknowledgement was not accepted");
      }
    } catch (error) {
      console.warn("[CatCode] wellness acknowledgement failed", error && error.message);
    } finally {
      wellnessCompleteButton.disabled = false;
    }
  });

  reminderAcknowledgementButton.addEventListener("click", hideReminderAcknowledgement);

  api.taskCompleteSoundVolumeGet &&
    api.taskCompleteSoundVolumeGet().then((nextVolume) => {
      volume = normalizeVolume(nextVolume);
    });
  api.soundMutedGet &&
    api.soundMutedGet().then((nextMuted) => {
      muted = !!nextMuted;
    });
  api.languageGet &&
    api.languageGet().then((nextLanguage) => {
      language = String(nextLanguage || "en").toLowerCase().split("-")[0];
    });
  api.attentionRequestsGet &&
    api.attentionRequestsGet().then((enabled) => {
      attentionEnabled = !!enabled;
      scheduleAttention();
    });
  api.attentionRequestIntervalGet &&
    api.attentionRequestIntervalGet().then((minutes) => {
      attentionIntervalMin = Math.max(
        1,
        Math.min(240, Math.round(Number(minutes) || 60)),
      );
      scheduleAttention();
    });
})();
