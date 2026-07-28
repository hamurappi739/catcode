(() => {
  "use strict";

  const translations = {
    ru: {
      title: "Создать своего кота",
      entry: "Создать своего кота",
      back: "Назад",
      intro: "Превратите фотографию своего кота в скин CatCode с помощью нейросети.",
      stepPhoto: "Прикрепите к нейросети фотографию вашего кота.",
      stepTemplate: "Скачайте и прикрепите JSON-шаблон CatCode.",
      stepPrompt: "Скопируйте промпт ниже и попросите вернуть только JSON-файл.",
      stepImport: "Сохраните ответ как файл .json и импортируйте его сюда.",
      downloadTemplate: "Скачать JSON-шаблон",
      copyPrompt: "Скопировать промпт",
      importJson: "Импортировать готового кота",
      copied: "Промпт скопирован. Прикрепите к нему фото и JSON-шаблон.",
      templateSaved: "Шаблон сохранен. Прикрепите его к сообщению для нейросети.",
      importSuccess: "Готово: скин добавлен в «Мои пресеты».",
      importFailed: "Не удалось импортировать файл. Проверьте, что нейросеть вернула JSON по шаблону.",
      prompt: `Я прикрепляю фотографию моего кота и JSON-шаблон для CatCode. Создай новый скин CatCode, который визуально повторяет моего кота.\n\nПравила:\n1. Сохрани структуру JSON полностью: schemaVersion, app, preset, pattern и все ключи внутри pattern. Не переименовывай и не удаляй ключи.\n2. В preset.name напиши имя кота.\n3. По фотографии подбери baseColor, цвета глаз и раскрась отметины в массивах head, body, tail, legFl, legFr, legRl, legRr, earL и earR. Каждый элемент отметины должен оставаться объектом с x, y и color.\n4. В шаблоне уже указан pixelResolution: 2. Оставь его без изменений и используй подробную сетку 64x64: координаты отметин в два раза плотнее старых 32x32.\n5. Передай все заметные цвета и пятна шерсти, не меняя формат значений.\n6. Верни только валидный JSON без Markdown, пояснений и обрамления в тройные кавычки. Я сохраню ответ как файл .json и импортирую его в CatCode.`,
    },
    en: {
      title: "Create your cat",
      entry: "Create your cat",
      back: "Back",
      intro: "Turn a photo of your cat into a CatCode skin with an AI assistant.",
      stepPhoto: "Attach a photo of your cat to an AI assistant.",
      stepTemplate: "Download and attach the CatCode JSON template.",
      stepPrompt: "Copy the prompt below and ask the assistant to return only a JSON file.",
      stepImport: "Save the answer as a .json file and import it here.",
      downloadTemplate: "Download JSON template",
      copyPrompt: "Copy prompt",
      importJson: "Import finished cat",
      copied: "Prompt copied. Attach a photo and the JSON template with it.",
      templateSaved: "Template saved. Attach it to the message for the AI assistant.",
      importSuccess: "Done: the skin was added to My presets.",
      importFailed: "The file could not be imported. Check that the AI returned JSON based on the template.",
      prompt: `I am attaching a photo of my cat and a CatCode JSON template. Create a new CatCode skin that visually matches my cat.\n\nRules:\n1. Preserve the entire JSON structure: schemaVersion, app, preset, pattern, and every key inside pattern. Do not rename or remove keys.\n2. Put the cat's name in preset.name.\n3. From the photo, choose baseColor, eye colors, and draw markings in the head, body, tail, legFl, legFr, legRl, legRr, earL, and earR arrays. Every marking item must remain an object with x, y, and color.\n4. The template already contains pixelResolution: 2. Keep it unchanged and use the detailed 64x64 grid: marking coordinates are twice as dense as the older 32x32 grid.\n5. Capture all clear coat colors and markings without changing value formats.\n6. Return valid JSON only, without Markdown, explanations, or triple-backtick fences. I will save the response as a .json file and import it into CatCode.`,
    },
  };

  const editPanel = document.getElementById("pattern-edit-panel");
  const presetsPanel = document.getElementById("preset-select-panel");
  const creatorPanel = document.getElementById("create-cat-panel");
  const openButton = document.getElementById("create-your-cat");
  const backButton = document.getElementById("back-to-presets");
  const prompt = document.getElementById("cat-ai-prompt");
  const copyButton = document.getElementById("copy-cat-prompt");
  const downloadButton = document.getElementById("download-cat-template");
  const importButton = document.getElementById("import-ai-cat");
  const status = document.getElementById("cat-creator-status");
  let language = "ru";

  function locale() {
    return translations[language] || translations.en;
  }

  function updateText() {
    const text = locale();
    document.querySelectorAll("[data-creator-i18n]").forEach((element) => {
      const key = element.dataset.creatorI18n;
      if (text[key]) element.textContent = text[key];
    });
    if (openButton) openButton.textContent = text.entry;
    if (prompt) prompt.value = text.prompt;
  }

  function showCreator() {
    if (!creatorPanel) return;
    editPanel?.classList.remove("active");
    presetsPanel?.classList.remove("active");
    creatorPanel.classList.add("active");
    status.textContent = "";
  }

  function showPresets() {
    creatorPanel?.classList.remove("active");
    editPanel?.classList.remove("active");
    presetsPanel?.classList.add("active");
  }

  async function copyPrompt() {
    const text = prompt?.value || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      prompt?.focus();
      prompt?.select();
      document.execCommand("copy");
      prompt?.setSelectionRange(0, 0);
    }
    status.textContent = locale().copied;
  }

  async function downloadTemplate() {
    const result = await window.electronAPI.patternAiTemplateSave();
    if (result?.ok) status.textContent = locale().templateSaved;
  }

  async function importCat() {
    const result = await window.electronAPI.patternCustomPresetsImport();
    if (!result || result.canceled) return;
    status.textContent = result.ok ? locale().importSuccess : locale().importFailed;
  }

  openButton?.addEventListener("click", showCreator);
  backButton?.addEventListener("click", showPresets);
  copyButton?.addEventListener("click", () => copyPrompt().catch(console.error));
  downloadButton?.addEventListener("click", () => downloadTemplate().catch(console.error));
  importButton?.addEventListener("click", () => importCat().catch(console.error));

  window.electronAPI.languageGet().then((value) => {
    language = value === "ru" ? "ru" : "en";
    updateText();
  });
  window.electronAPI.onLanguageChanged((value) => {
    language = value === "ru" ? "ru" : "en";
    updateText();
  });
})();
