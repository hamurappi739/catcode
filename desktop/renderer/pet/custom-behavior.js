"use strict";

// Product-specific behavior kept outside the recovered renderer bundle.
// It only uses the trusted preload API and DOM nodes owned by the pet window.

(() => {
  const api = window.electronAPI;
  const cat = document.getElementById("cat");
  if (!api || !cat) return;

  const ATTENTION_MIN_MS = 10 * 60 * 1000;
  const ATTENTION_MAX_MS = 60 * 60 * 1000;
  const ATTENTION_SOUND_INTERVAL_MS = 8000;
  const previewSound = new Audio("../../assets/sound/meow.m4a");
  const purringSound = new Audio("../../assets/sound/purring.m4a");
  const attentionSound = new Audio("../../assets/sound/meow-alert.m4a");
  let volume = 0.1;
  let muted = false;
  let language = "en";
  let attentionEnabled = true;
  let attentionActive = false;
  let attentionTimer = null;
  let attentionSoundTimer = null;
  let purrTimer = null;

  purringSound.loop = true;
  for (const audio of [previewSound, purringSound, attentionSound]) {
    audio.preload = "auto";
  }

  const attentionMessage = document.createElement("div");
  attentionMessage.id = "cat-attention-request";
  attentionMessage.setAttribute("role", "status");
  attentionMessage.hidden = true;
  document.body.appendChild(attentionMessage);

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
      animation: cat-attention-pop 1s steps(2, end) infinite;
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
    @keyframes cat-attention-pop {
      0%, 100% { transform: translateX(-50%) translateY(0); }
      50% { transform: translateX(-50%) translateY(-3px); }
    }
  `;
  document.head.appendChild(style);

  function normalizeVolume(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function copyPlay(audio, nextVolume, { restart = true } = {}) {
    if (!audio || nextVolume <= 0) return;
    audio.volume = nextVolume;
    if (restart) audio.currentTime = 0;
    audio.play().catch((error) => {
      console.warn("[CatCode] sound playback failed", error && error.message);
    });
  }

  function stopPurring() {
    if (purrTimer) clearTimeout(purrTimer);
    purrTimer = null;
    purringSound.pause();
    purringSound.currentTime = 0;
  }

  function playPurr() {
    if (muted) return;
    // A higher floor keeps the tactile interaction audible at low UI volumes.
    copyPlay(purringSound, Math.max(0.25, volume), { restart: false });
    if (purrTimer) clearTimeout(purrTimer);
    purrTimer = setTimeout(stopPurring, 1800);
  }

  function randomAttentionDelay() {
    return (
      ATTENTION_MIN_MS +
      Math.floor(Math.random() * (ATTENTION_MAX_MS - ATTENTION_MIN_MS + 1))
    );
  }

  function translateAttentionMessage() {
    return language === "ru" ? "Погладь меня, пожалуйста" : "Pet me, please";
  }

  function clearAttentionSoundTimer() {
    if (attentionSoundTimer) clearInterval(attentionSoundTimer);
    attentionSoundTimer = null;
  }

  function playAttentionSound() {
    if (muted || !attentionActive) return;
    copyPlay(attentionSound, volume);
  }

  function scheduleAttention() {
    if (attentionTimer) clearTimeout(attentionTimer);
    attentionTimer = null;
    if (!attentionEnabled || attentionActive) return;
    attentionTimer = setTimeout(startAttention, randomAttentionDelay());
  }

  function stopAttention({ reschedule = true } = {}) {
    attentionActive = false;
    attentionMessage.hidden = true;
    delete document.body.dataset.attentionRequest;
    clearAttentionSoundTimer();
    if (reschedule) scheduleAttention();
  }

  function startAttention() {
    attentionTimer = null;
    if (!attentionEnabled || attentionActive) return;
    attentionActive = true;
    attentionMessage.textContent = translateAttentionMessage();
    attentionMessage.hidden = false;
    document.body.dataset.attentionRequest = "1";
    playAttentionSound();
    attentionSoundTimer = setInterval(playAttentionSound, ATTENTION_SOUND_INTERVAL_MS);
  }

  function isCatHeadPoint(event) {
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
    playPurr();
    if (attentionActive) stopAttention();
  }

  // The native interaction is a cursor stroke over the head. It deliberately
  // does not require a click because the pet window is mostly transparent.
  window.addEventListener("mousemove", handlePetting, true);
  document.addEventListener("pointerdown", handlePetting, true);

  api.onSoundPreview &&
    api.onSoundPreview((payload) => {
      const previewVolume = normalizeVolume(payload && payload.volume);
      copyPlay(previewSound, previewVolume);
    });
  api.onTaskCompleteSoundVolume &&
    api.onTaskCompleteSoundVolume((nextVolume) => {
      volume = normalizeVolume(nextVolume);
      for (const audio of [previewSound, purringSound, attentionSound]) {
        audio.volume = volume;
      }
    });
  api.onSoundMuted &&
    api.onSoundMuted((nextMuted) => {
      muted = !!nextMuted;
      if (muted) {
        stopPurring();
        attentionSound.pause();
        attentionSound.currentTime = 0;
      }
    });
  api.onAttentionRequestsEnabled &&
    api.onAttentionRequestsEnabled((enabled) => {
      attentionEnabled = !!enabled;
      stopAttention({ reschedule: attentionEnabled });
    });
  api.onLanguageChanged &&
    api.onLanguageChanged((nextLanguage) => {
      language = String(nextLanguage || "en").toLowerCase().split("-")[0];
      if (attentionActive) attentionMessage.textContent = translateAttentionMessage();
    });

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
})();
