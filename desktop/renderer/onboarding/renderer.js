"use strict";

const $ = (selector) => document.querySelector(selector);
const tour = $("#tour");
const stepCount = $("#step-count");
const progressFill = $("#progress-fill");
const eyebrow = $("#eyebrow");
const title = $("#title");
const description = $("#description");
const details = $("#details");
const bubble = $("#demo-bubble");
const demoCat = $("#demo-cat");
const stateControls = $("#state-controls");
const action = $("#action");
const back = $("#back");
const next = $("#next");
const skip = $("#skip");
const dots = $("#dots");

const V6_ASSET_ROOT = "../pet/assets/v6/";
const V6_DEMO_SEQUENCES = Object.freeze({
  typing: Object.freeze([
    "typing/typing-f0-ready.png",
    "typing/typing-f1-left.png",
    "typing/typing-f2-right.png",
    "typing/typing-f3-fast.png",
    "typing/typing-f2-right.png",
    "typing/typing-f1-left.png",
  ].map((path) => ({ path, durationMs: 150 }))),
  celebrate: Object.freeze([
    { path: "celebrate/celebrate-f0-ready.png", durationMs: 220 },
    { path: "celebrate/celebrate-f1-jump.png", durationMs: 520 },
    { path: "celebrate/celebrate-f2-return.png", durationMs: 420 },
  ]),
  sleep: Object.freeze([
    { path: "idle-master.png", durationMs: 320 },
    { path: "sleep/sleep-f0-closed.png", durationMs: 320 },
    { path: "sleep/sleep-f1-transition.png", durationMs: 2200 },
  ]),
  walk: Object.freeze([
    { path: "walk/walk-left-f0.png", durationMs: 200, offsetX: 64 },
    { path: "walk/walk-left-f1.png", durationMs: 200, offsetX: 32 },
    { path: "walk/walk-left-f2.png", durationMs: 200, offsetX: 0 },
    { path: "walk/walk-left-f3.png", durationMs: 200, offsetX: -32 },
    { path: "walk/walk-left-f4.png", durationMs: 200, offsetX: -64 },
    { path: "walk/walk-right-f0.png", durationMs: 200, offsetX: -64 },
    { path: "walk/walk-right-f1.png", durationMs: 200, offsetX: -32 },
    { path: "walk/walk-right-f2.png", durationMs: 200, offsetX: 0 },
    { path: "walk/walk-right-f3.png", durationMs: 200, offsetX: 32 },
    { path: "walk/walk-right-f4.png", durationMs: 200, offsetX: 64 },
  ]),
  dance: Object.freeze([
    "drill-f00-ready.png",
    "drill-f01-left-bounce.png",
    "drill-f02-left-punch.png",
    "drill-f03-center-bounce.png",
    "drill-f04-right-bounce.png",
    "drill-f05-right-punch.png",
    "drill-f06-bounce-up.png",
    "drill-f07-shoulder-pop.png",
    "drill-f08-settle.png",
    "drill-f09-loop-return.png",
  ].map((fileName) => ({ path: `dance/drill/${fileName}`, durationMs: 143 }))),
});

const demoSceneImages = {
  hello: "idle-master.png",
  typing: "typing/typing-f0-ready.png",
  sleep: "sleep/sleep-f0-closed.png",
  playful: "walk/walk-left-f0.png",
  music: "dance/drill/drill-f00-ready.png",
};

let demoTimerId = null;
let demoEpoch = 0;

function sourceForDemoPath(path) {
  return path.startsWith("../") ? path : `${V6_ASSET_ROOT}${path}`;
}

function stopDemo() {
  demoEpoch += 1;
  if (demoTimerId) clearTimeout(demoTimerId);
  demoTimerId = null;
  demoCat?.style.removeProperty("--demo-offset-x");
  if (demoCat) delete demoCat.dataset.animation;
}

function setDemoFrame(frame) {
  if (!demoCat || !frame) return;
  const source = sourceForDemoPath(frame.path);
  if (demoCat.getAttribute("src") !== source) demoCat.setAttribute("src", source);
  if (Number.isFinite(frame.offsetX)) {
    demoCat.style.setProperty("--demo-offset-x", `${frame.offsetX}px`);
  } else {
    demoCat.style.removeProperty("--demo-offset-x");
  }
}

function playDemo(demoName, fallbackPath) {
  stopDemo();
  const sequence = V6_DEMO_SEQUENCES[demoName];
  if (!sequence || sequence.length === 0) {
    setDemoFrame({ path: fallbackPath });
    return;
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    setDemoFrame(sequence[0]);
    return;
  }

  const token = demoEpoch;
  let frameIndex = 0;
  demoCat.dataset.animation = demoName;
  const advance = () => {
    if (token !== demoEpoch) return;
    const frame = sequence[frameIndex];
    setDemoFrame(frame);
    frameIndex = (frameIndex + 1) % sequence.length;
    demoTimerId = setTimeout(advance, frame.durationMs);
  };
  advance();
}

const platform = window.onboardingAPI.platform;
const language = new URLSearchParams(window.location.search).get("language") === "en"
  ? "en"
  : "ru";

const labels = {
  ru: {
    back: "Назад",
    next: "Дальше",
    start: "Начать",
    skip: "Пропустить тур",
    openEditor: "Открыть редактор кота",
    allowed: "разрешено",
  },
  en: {
    back: "Back",
    next: "Next",
    start: "Start",
    skip: "Skip tour",
    openEditor: "Open cat editor",
    allowed: "allowed",
  },
}[language];

const platformMovementDetails = {
  ru: {
    win32: [
      "Прогулка, прыжки и кража курсора выключены по умолчанию и включаются отдельно.",
      "Опция скрытия над полноэкранными приложениями убирает кота во время игр и видео.",
    ],
    darwin: [
      "Прогулки и прыжки включаются отдельно; для кражи курсора потребуется Accessibility.",
      "Все игровые действия можно остановить в любой момент через настройки.",
    ],
    linux: [
      "Прогулки и прыжки включаются отдельно и не мешают обычному перетаскиванию кота.",
      "Кража курсора и скрытие над полноэкранными приложениями пока недоступны в Linux.",
    ],
  },
  en: {
    win32: [
      "Walking, jumping, and cursor stealing are off by default and enabled separately.",
      "Hide over fullscreen apps keeps the cat out of the way during games and videos.",
    ],
    darwin: [
      "Walking and jumping are optional; cursor stealing requires Accessibility permission.",
      "Every playful action can be disabled at any time in Settings.",
    ],
    linux: [
      "Walking and jumping are optional and never replace normal drag-and-drop movement.",
      "Cursor stealing and fullscreen hiding are not available on Linux yet.",
    ],
  },
};

function baseStepsRu() {
  return [
    {
      scene: "hello",
      image: "../pet/assets/v6/idle-master.png",
      section: "ПЕРВЫЙ ЗАПУСК",
      title: "Знакомьтесь: ваш CatCode",
      description: "Живой кот-компаньон поверх рабочего стола. Он реагирует на ваши действия, помогает держать ритм работы и напоминает заботиться о себе.",
      details: [
        "Проведите курсором по коту, чтобы погладить его и услышать мурлыканье.",
        "Перетащите кота в удобное место, а правым кликом откройте команды и настройки.",
      ],
      bubble: "Привет! Я рядом.",
    },
    {
      scene: "rhythm",
      image: "../pet/assets/v6/typing/typing-f0-ready.png",
      demo: "typing",
      section: "РЕАКЦИИ НА РАБОТУ",
      title: "Кот чувствует ваш рабочий ритм",
      description: "CatCode реагирует на клавиатуру и прокрутку, но не читает содержимое ваших документов или экранов.",
      details: [
        "При быстрой печати кот оживляется и нажимает клавиши вместе с вами.",
        "Прокрутка запускает отдельную реакцию, а после долгого бездействия кот засыпает.",
      ],
      states: [["hello", "Рядом"], ["typing", "Печатает"], ["sleep", "Спит"]],
    },
    {
      scene: "message",
      image: "../pet/assets/v6/idle-master.png",
      section: "ИМЯ И ФРАЗА",
      title: "Имя кота и ваше имя — разные вещи",
      description: "В настройках можно задать имя CatCode и своё имя. Кот будет обращаться к вам по вашему имени, а своё имя будет показывать как имя питомца.",
      details: [
        "Имя кота — имя вашего питомца.",
        "Ваше имя — то, как кот обращается к вам. Подпись и закреплённое сообщение можно скрывать отдельно.",
      ],
      bubble: "Сегодня всё получится.",
    },
    {
      scene: "reminders",
      image: "../pet/assets/v6/celebrate/celebrate-f0-ready.png",
      demo: "celebrate",
      section: "НАПОМИНАНИЯ",
      title: "Напоминания помогают не держать всё в голове",
      description: "Создавайте одноразовые и повторяющиеся напоминания. Значок часов появляется над котом только тогда, когда напоминания действительно есть.",
      details: [
        "Для повторов можно выбрать нужные дни недели.",
        "Кот показывает текст в нужный момент, а значок часов виден только при активных напоминаниях.",
      ],
      bubble: "Пора вернуться к важному.",
    },
    {
      scene: "focus",
      image: "../pet/assets/v6/sleep/sleep-f0-closed.png",
      demo: "sleep",
      section: "POMODORO",
      title: "Работайте отрезками, отдыхайте вовремя",
      description: "Запускайте фокус-сессию, ставьте её на паузу и отдельно выбирайте длительность работы и перерыва.",
      details: [
        "Длительность работы и перерыва настраивается отдельно.",
        "Таймер можно поставить на паузу, сбросить или настроить заново.",
      ],
    },
    {
      scene: "wellness",
      image: "../pet/assets/v6/idle-master.png",
      section: "ВОДА И РАЗМИНКА",
      title: "Вода и разминка — две отдельные привычки",
      description: "Настройте интервалы напоминаний или запустите любую просьбу вручную через меню.",
      details: [
        "После воды нажмите «Хорошо», а после разминки — «Размялся/размялась», чтобы закрыть просьбу.",
        "При включённой проверке кот может рассердиться, если разминка долго остаётся без подтверждения.",
      ],
    },
    {
      scene: "playful",
      image: "../pet/assets/v6/walk/walk-left-f0.png",
      demo: "walk",
      section: "ИГРОВОЕ ПОВЕДЕНИЕ",
      title: "Прогулка, охота и кража курсора",
      description: "Эти игровые функции включаются отдельно и не мешают обычной работе, пока вы сами их не разрешите.",
      details: [
        "Для охоты включите «Охотиться за курсором», затем быстро проведите курсором рядом с котом влево и вправо.",
        "При краже курсора кот говорит «Поймал!», а при возврате — «На, держи!». Охота и кража не запускаются во время сна, танца и перетаскивания.",
        ...(platformMovementDetails.ru[platform] || platformMovementDetails.ru.linux),
      ],
    },
    {
      scene: "music",
      image: "../pet/assets/v6/dance/drill/drill-f00-ready.png",
      demo: "dance",
      section: "ТАНЕЦ ПОД МУЗЫКУ",
      title: "Включили музыку — кот начинает танцевать",
      description: "На Windows CatCode замечает системный звук и танцует, пока музыка играет. Само аудио не записывается и никуда не отправляется.",
      details: [
        "Танец можно полностью отключить в настройках.",
        "Когда музыка заканчивается, кот завершает короткий круг и останавливается.",
      ],
    },
    {
      scene: "peek",
      image: "../pet/assets/v6/edge-peek/peek-from-left-looking-right.png",
      section: "РЕЖИМ ВЫГЛЯДЫВАНИЯ",
      title: "Нужно больше места — кот спрячется у края",
      description: "Отправьте кота к левому или правому краю экрана. Нажатие возвращает его обратно, а сообщения остаются видимыми целиком.",
      details: [
        "Режим удобен поверх редактора, браузера или рабочего окна.",
        "Для воды и растяжки можно отдельно включить компактное выглядывание.",
      ],
      bubble: "Я здесь!",
    },
    {
      scene: "editor",
      image: "../pet/assets/v6/skins/black-owner-v1/idle-master.png",
      section: "ВНЕШНОСТЬ И СКИНЫ",
      title: "Выберите скин или настройте свои цвета",
      description: "В каталоге можно выбрать готовый окрас, а в редакторе — настроить палитру своего кота и сразу увидеть результат в нескольких позах.",
      details: [
        "Редактор показывает Idle, Walk, Sleep, Hunt и Typing.",
        "Форма тела, зрачки, веки, клавиатура и эффекты защищены от случайной перекраски.",
      ],
      action: labels.openEditor,
      actionId: "open-cat-editor",
    },
    {
      scene: "settings",
      image: "../pet/assets/v6/idle-master.png",
      section: "ЗВУК И НАСТРОЙКИ",
      title: "Настройте CatCode под себя",
      description: "В настройках можно изменить размер кота, язык, громкость, автозапуск и поведение отдельных функций.",
      details: [
        "Размер меняет масштаб кота на рабочем столе, а не качество исходных изображений.",
        "Можно отдельно отключить сон, прогулку, охоту, танцы, кражу курсора и уведомления.",
      ],
      bubble: "Настрой меня под себя.",
    },
    {
      scene: "share",
      image: "../pet/assets/v6/celebrate/celebrate-f0-ready.png",
      section: "ПОКАЗАТЬ CATCODE",
      title: "Сохраните или покажите своего кота",
      description: "Команда «Показать моего CatCode» записывает короткую демонстрацию. Если запись недоступна, приложение предложит сохранить PNG-снимок.",
      details: [
        "Вы сами выбираете место сохранения файла.",
        "Запись экрана запускается только этой командой и не работает постоянно в фоне.",
      ],
    },
    {
      scene: "ready",
      image: "../pet/assets/v6/idle-master.png",
      section: "ВСЁ ГОТОВО",
      title: "Теперь CatCode настроен под вас",
      description: "Начните с имени, выберите внешний вид, настройте размер и включите только те реакции, которые действительно нужны.",
      details: [
        "Обучалку всегда можно открыть снова через «Настройки» → «Пройти обучение».",
        "Все функции можно изменить или отключить позже без переустановки приложения.",
      ],
      states: [["hello", "Обычный"], ["sleep", "Сон"], ["typing", "Печатает"], ["playful", "Прогулка"]],
      bubble: "Ну что, работаем?",
    },
  ];
}

function baseStepsEn() {
  return [
    { scene: "hello", image: "../pet/assets/v6/idle-master.png", section: "FIRST LAUNCH", title: "Meet your CatCode", description: "A living desktop companion that stays above your workspace, reacts to your rhythm, and reminds you to look after yourself.", details: ["Move the pointer over the cat to pet it and hear it purr.", "Drag it into place and right-click it to open commands and settings."], bubble: "Hi! I am right here." },
    { scene: "rhythm", image: "../pet/assets/v6/typing/typing-f0-ready.png", demo: "typing", section: "WORK REACTIONS", title: "The cat feels your work rhythm", description: "CatCode reacts to keyboard and scrolling activity without reading your documents or screen content.", details: ["Fast typing makes the cat come alive and tap the keyboard with you.", "Scrolling triggers its own reaction, while long inactivity makes it sleep."], states: [["hello", "Nearby"], ["typing", "Typing"], ["sleep", "Sleeping"]] },
    { scene: "message", image: "../pet/assets/v6/idle-master.png", section: "NAME AND MESSAGE", title: "The cat name and your name are different", description: "Set CatCode's name and your own name separately. The cat uses your name when addressing you and keeps its own name as the pet label.", details: ["The cat name belongs to your pet.", "Your name is how the cat addresses you. The label and pinned message can be hidden independently."], bubble: "You have got this." },
    { scene: "reminders", image: "../pet/assets/v6/celebrate/celebrate-f0-ready.png", demo: "celebrate", section: "REMINDERS", title: "Do not keep everything in your head", description: "Create one-time or repeating reminders for tasks, meetings, and important habits.", details: ["Choose specific weekdays and times for repeating schedules.", "The clock appears only while active reminders exist."], bubble: "Time for the important thing." },
    { scene: "focus", image: "../pet/assets/v6/sleep/sleep-f0-closed.png", demo: "sleep", section: "FOCUS", title: "A clear rhythm for work and rest", description: "Start or pause a focus session and choose work and break duration independently.", details: ["Reset or change the timer whenever your day changes.", "CatCode tells you when it is time to switch phases."] },
    { scene: "wellness", image: "../pet/assets/v6/idle-master.png", section: "WATER AND STRETCHING", title: "Water and stretching are separate habits", description: "Choose your own intervals or trigger either reminder manually from the menu.", details: ["Press Okay after drinking and Stretch done after stretching to close the request.", "With accountability enabled, the cat may get angry when a stretch request stays unconfirmed."] },
    { scene: "playful", image: "../pet/assets/v6/walk/walk-left-f0.png", demo: "walk", section: "PLAYFUL BEHAVIOUR", title: "Walking and cursor stealing are optional", description: "The cat can roam or briefly catch the cursor only when you allow those features.", details: ["It says Caught! when taking the cursor and Here, take it when returning it.", ...(platformMovementDetails.en[platform] || platformMovementDetails.en.linux)] },
    { scene: "music", image: "../pet/assets/v6/dance/drill/drill-f00-ready.png", demo: "dance", section: "MUSIC AND DANCE", title: "Play music and the cat starts dancing", description: "On Windows, CatCode reacts to system audio while never recording or uploading the audio itself.", details: ["When music ends, the cat finishes a short circle and stops.", "Music dancing can be disabled completely in Settings."] },
    { scene: "peek", image: "../pet/assets/v6/edge-peek/peek-from-left-looking-right.png", section: "SCREEN EDGE", title: "The cat can peek from the edge", description: "Send it to the left or right edge to free up workspace.", details: ["Click it to bring it back; messages remain visible.", "Water and stretching can use compact peek mode separately."], bubble: "I am here!" },
    { scene: "editor", image: "../pet/assets/v6/skins/black-owner-v1/idle-master.png", section: "APPEARANCE", title: "Pick a skin or tune your own colours", description: "Choose a ready-made skin or use the editor to customise your cat's palette and preview it in several poses.", details: ["The editor shows Idle, Walk, Sleep, Hunt, and Typing.", "Body shape, pupils, eyelids, keyboard, and effects are protected from accidental repainting."], action: labels.openEditor, actionId: "open-cat-editor" },
    { scene: "angry", image: "../pet/assets/v6/angry/angry-idle.png", section: "PERSONALITY", title: "CatCode has a mood", description: "If you ignore a stretch request with accountability enabled, the cat can turn red, show angry eyes, and growl three times.", details: ["After the reaction, it returns to its normal state.", "You can disable playful reactions separately for a calmer mode."], bubble: "I asked you to stretch!" },
    { scene: "settings", image: "../pet/assets/v6/idle-master.png", section: "SIZE AND SETTINGS", title: "Make CatCode fit your day", description: "Change the cat size, language, volume, startup, and individual behaviours in Settings.", details: ["Size changes the desktop scale, not the source art quality.", "Sleep, walking, hunting, dancing, cursor stealing, and notifications can be disabled separately."], bubble: "Make me yours." },
    { scene: "share", image: "../pet/assets/v6/celebrate/celebrate-f0-ready.png", section: "SHOW CATCODE", title: "Save or share your cat", description: "Show my CatCode records a short demo. If recording is unavailable, the app offers a PNG snapshot instead.", details: ["You choose where the file is saved.", "Screen recording starts only for this command and never runs continuously in the background."] },
    { scene: "ready", image: "../pet/assets/v6/idle-master.png", section: "READY", title: "CatCode is yours now", description: "Set a name, choose an appearance, adjust the size, and enable only the reactions you want.", details: ["Open this tour again from Settings → Take the tour.", "Every feature can be changed or disabled later without reinstalling."], states: [["hello", "Normal"], ["sleep", "Sleep"], ["typing", "Typing"], ["playful", "Walking"]], bubble: "Shall we work?" },
  ];
}

const steps = language === "en" ? baseStepsEn() : baseStepsRu();
if (platform !== "win32") {
  const musicIndex = steps.findIndex((step) => step.scene === "music");
  if (musicIndex >= 0) steps.splice(musicIndex, 1);
}

if (platform === "darwin") {
  steps.splice(1, 0, language === "en" ? {
    scene: "mac-permissions",
    section: "MACOS PERMISSIONS",
    title: "Allow CatCode to react to your work",
    description: "macOS protects input and screen capture. CatCode requests only the permissions used by its features.",
    details: [
      "Accessibility enables input reactions and cursor movement without reading document content.",
      "Input Monitoring may be needed if keyboard reactions do not start after Accessibility.",
      "Screen Recording is used only by Show my CatCode.",
    ],
    actions: [["accessibility", "Accessibility"], ["inputMonitoring", "Input Monitoring"], ["screenRecording", "Screen Recording"]],
  } : {
    scene: "mac-permissions",
    section: "РАЗРЕШЕНИЯ MACOS",
    title: "Разрешите CatCode реагировать на вашу работу",
    description: "macOS защищает ввод и запись экрана. CatCode запрашивает только разрешения, которые используются его функциями.",
    details: [
      "Accessibility включает реакции на ввод и движение курсора, не читая содержимое документов.",
      "Input Monitoring может понадобиться, если реакции клавиатуры не появятся после Accessibility.",
      "Screen Recording используется только командой «Показать моего CatCode».",
    ],
    actions: [["accessibility", "Accessibility"], ["inputMonitoring", "Input Monitoring"], ["screenRecording", "Запись экрана"]],
  });
}

let index = 0;

async function refreshMacPermissionButtons() {
  if (steps[index].scene !== "mac-permissions") return;
  let status;
  try {
    status = await window.onboardingAPI.macosPermissionsGet();
  } catch {
    return;
  }

  stateControls.querySelectorAll("[data-mac-permission]").forEach((button) => {
    const pane = button.dataset.macPermission;
    const value = status && status[pane];
    const label = button.dataset.label;
    button.textContent = value === "granted" ? `${label} · ${labels.allowed}` : label;
    button.setAttribute("aria-pressed", String(value === "granted"));
  });
}

function render() {
  const step = steps[index];
  tour.dataset.scene = step.scene;
  playDemo(step.demo, step.image);
  stepCount.textContent = `${index + 1} / ${steps.length}`;
  progressFill.style.width = `${((index + 1) / steps.length) * 100}%`;
  eyebrow.textContent = `${String(index + 1).padStart(2, "0")} / ${steps.length}  ${step.section}`;
  title.textContent = step.title;
  description.textContent = step.description;
  bubble.textContent = step.bubble || "";
  details.replaceChildren(...step.details.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
  dots.replaceChildren(...steps.map((_, itemIndex) => {
    const dot = document.createElement("i");
    if (itemIndex === index) dot.className = "active";
    return dot;
  }));

  const stateButtons = (step.states || []).map(([scene, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(scene === step.scene));
    button.addEventListener("click", () => {
      tour.dataset.scene = scene;
      playDemo(scene === "playful" ? "walk" : scene === "music" ? "dance" : scene, demoSceneImages[scene]);
      stateControls.querySelectorAll("button").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
    });
    return button;
  });
  const permissionButtons = (step.actions || []).map(([pane, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.macPermission = pane;
    button.dataset.label = label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", async () => {
      await window.onboardingAPI.macosPermissionsOpen(pane);
    });
    return button;
  });
  stateControls.replaceChildren(...stateButtons, ...permissionButtons);
  if (step.scene === "mac-permissions") refreshMacPermissionButtons();

  action.hidden = !step.action;
  action.textContent = step.action || "";
  back.disabled = index === 0;
  back.textContent = labels.back;
  next.textContent = index === steps.length - 1 ? labels.start : labels.next;
  skip.textContent = labels.skip;
}

back.addEventListener("click", () => {
  index = Math.max(0, index - 1);
  render();
});
next.addEventListener("click", async () => {
  if (index < steps.length - 1) {
    index += 1;
    render();
    return;
  }
  next.disabled = true;
  await window.onboardingAPI.complete();
});
skip.addEventListener("click", async () => {
  skip.disabled = true;
  await window.onboardingAPI.skip();
});
action.addEventListener("click", () => {
  if (steps[index].actionId === "open-cat-editor") {
    window.onboardingAPI.openCatEditor();
  }
});
window.addEventListener("focus", () => refreshMacPermissionButtons());
render();
