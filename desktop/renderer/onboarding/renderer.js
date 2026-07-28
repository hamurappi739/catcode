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
const stateControls = $("#state-controls");
const action = $("#action");
const back = $("#back");
const next = $("#next");
const skip = $("#skip");
const dots = $("#dots");

const steps = [
  {
    scene: "hello",
    eyebrow: "01 / 11  ПЕРВЫЙ ЗАПУСК",
    title: "Добро пожаловать в CatCode",
    description: "Кот живёт на рабочем столе, помогает держать ритм и делает рабочий день чуть человечнее.",
    details: [
      "Проведите курсором по голове кота, чтобы погладить его.",
      "Правый клик по коту открывает все инструменты.",
    ],
  },
  {
    scene: "message",
    eyebrow: "02 / 11  ИМЯ И ФРАЗА",
    title: "Кот может говорить от вашего имени",
    description: "В меню «Имя» задайте имя кота, ваше имя и закреплённую фразу над ним.",
    details: [
      "Имя кота можно показывать или скрывать на рабочем столе.",
      "Закреплённая фраза подойдёт для цели дня или важной мысли.",
    ],
    bubble: "Привет! Я рядом.",
  },
  {
    scene: "reminders",
    eyebrow: "03 / 11  НАПОМИНАНИЯ",
    title: "Не держите всё в голове",
    description: "Кнопка часов рядом с котом открывает напоминания. CatCode позовёт в нужное время.",
    details: [
      "Создавайте одноразовые и повторяющиеся напоминания.",
      "Выбирайте отдельные дни недели для расписания.",
    ],
    bubble: "Время важного дела!",
  },
  {
    scene: "focus",
    eyebrow: "04 / 11  POMODORO",
    title: "Ритм работы и отдыха",
    description: "В меню Pomodoro запускайте фокус-сессию, меняйте длительность и ставьте её на паузу.",
    details: [
      "Кот подскажет, когда пора переключиться на отдых.",
      "Длительность фокуса и перерыва настраивается отдельно.",
    ],
  },
  {
    scene: "wellness",
    eyebrow: "05 / 11  ЗДОРОВЬЕ",
    title: "Вода и растяжка",
    description: "Кот может сам пригласить размяться или выпить воды. Интервалы выбираются в меню.",
    details: [
      "Команды «Растяжка сейчас» и «Вода сейчас» работают мгновенно.",
      "Уведомления можно отключить в настройках, не выключая кота.",
    ],
  },
  {
    scene: "peek",
    eyebrow: "06 / 11  ВЫГЛЯДЫВАНИЕ",
    title: "Кот может спрятаться у края",
    description: "Режим выглядывания отправляет кота к левому или правому краю экрана. Клик по нему возвращает кота обратно.",
    details: [
      "Это удобно, когда нужно освободить место на рабочем столе.",
      "Растяжка и вода могут выглядывать отдельно.",
    ],
    bubble: "Я здесь!",
  },
  {
    scene: "share",
    eyebrow: "07 / 11  ПОКАЗАТЬ CATCODE",
    title: "Делитесь своим котом",
    description: "Пункт «Показать моего CatCode» записывает короткое видео. Если Windows запретит запись, CatCode предложит сохранить PNG-снимок.",
    details: [
      "Команда находится в меню правого клика по коту.",
      "Файл сохраняется только после выбора места вами.",
    ],
  },
  {
    scene: "editor",
    eyebrow: "08 / 11  РЕДАКТОР КОТА",
    title: "Соберите своего CatCode",
    description: "В редакторе кота можно выбрать готовый скин или перекрасить каждую часть под свой стиль.",
    details: [
      "В пресетах есть встроенные варианты и «Скины CatCode».",
      "Ваши изменения сохраняются локально и применяются сразу.",
    ],
    action: "Открыть редактор кота",
    actionId: "open-cat-editor",
  },
  {
    scene: "sound",
    eyebrow: "09 / 11  ГРОМКОСТЬ ЗВУКА",
    title: "Выберите характер кота",
    description: "В меню «Громкость звука» есть десять уровней. Каждый клик проигрывает пробное мяуканье.",
    details: [
      "Подберите уровень на слух, не закрывая меню.",
      "Пункт «Без звука» мгновенно выключает все звуки.",
    ],
  },
  {
    scene: "settings",
    eyebrow: "10 / 11  НАСТРОЙКИ",
    title: "Кот подстраивается под вас",
    description: "В настройках выбираются язык, автозапуск, уведомления и пункт «Кот просит внимания».",
    details: [
      "С ним кот в случайный момент попросит погладить его и будет мяукать.",
      "Все настройки можно изменить в любой момент.",
    ],
    bubble: "Погладь меня, пожалуйста",
  },
  {
    scene: "states",
    eyebrow: "11 / 11  ЖИВОЙ КОТ",
    title: "Он реагирует на ваш день",
    description: "Когда компьютер долго бездействует, кот засыпает. А очень быстрая печать превращает его в рыжего помощника, который нажимает клавиши вместе с вами.",
    details: [
      "Кликните по состояниям ниже, чтобы посмотреть мини-демо.",
      "Кот также растягивается, пьёт воду и радуется завершённым делам.",
    ],
    states: [
      ["hello", "Обычный"],
      ["sleep", "Сон"],
      ["typing", "Быстрая печать"],
      ["stretch", "Растяжка"],
    ],
  },
];

if (window.onboardingAPI.platform === "darwin") {
  steps.splice(1, 0, {
    scene: "mac-permissions",
    eyebrow: "02 / 12  РАЗРЕШЕНИЯ MACOS",
    title: "Разрешите CatCode реагировать на вашу работу",
    description:
      "macOS защищает ввод и запись экрана. CatCode попросит только те системные разрешения, которые нужны его функциям.",
    details: [
      "Accessibility позволяет коту замечать печать и прокрутку, не читая содержимое документов.",
      "Input Monitoring понадобится, если реакции на клавиатуру не начнутся после Accessibility.",
      "Screen Recording используется только при запуске команды «Показать моего CatCode».",
    ],
    actions: [
      ["accessibility", "Accessibility"],
      ["inputMonitoring", "Input Monitoring"],
      ["screenRecording", "Запись экрана"],
    ],
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
    button.textContent = value === "granted" ? `${label} · разрешено` : label;
    button.setAttribute("aria-pressed", String(value === "granted"));
  });
}

function render() {
  const step = steps[index];
  tour.dataset.scene = step.scene;
  stepCount.textContent = `${index + 1} / ${steps.length}`;
  progressFill.style.width = `${((index + 1) / steps.length) * 100}%`;
  eyebrow.textContent = step.eyebrow.replace(
    /^\d+\s*\/\s*\d+/,
    `${String(index + 1).padStart(2, "0")} / ${steps.length}`,
  );
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
  if (step.scene === "mac-permissions") {
    refreshMacPermissionButtons();
  }
  action.hidden = !step.action;
  action.textContent = step.action || "";
  back.disabled = index === 0;
  back.textContent = "Назад";
  next.textContent = index === steps.length - 1 ? "Начать" : "Дальше";
  skip.textContent = "Пропустить тур";
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
