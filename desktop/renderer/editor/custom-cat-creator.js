(() => {
  "use strict";

  // V4-first AI creator prompts. Primary contract is schemaVersion 4 with one
  // 64x64 markings workspace. Legacy part grids are not requested.

  const translations = {
    ru: {
      title: "Создать своего кота",
      entry: "Создать своего кота",
      back: "Назад",
      intro: "Превратите фотографию своего кота в скин CatCode V4 с помощью нейросети.",
      stepPhoto: "Прикрепите к нейросети фотографию вашего кота.",
      stepTemplate: "Скачайте и прикрепите JSON-шаблон CatCode V4.",
      stepPrompt: "Скопируйте промпт ниже и попросите вернуть только JSON-файл.",
      stepImport: "Сохраните ответ как файл .json и импортируйте его сюда.",
      downloadTemplate: "Скачать JSON-шаблон",
      copyPrompt: "Скопировать промпт",
      importJson: "Импортировать готового кота",
      copied: "Промпт скопирован. Прикрепите к нему фото и JSON-шаблон.",
      templateSaved: "Шаблон сохранен. Прикрепите его к сообщению для нейросети.",
      importSuccess: "Готово: скин добавлен в «Импортированные».",
      importFailed: "Не удалось импортировать файл. Проверьте, что нейросеть вернула JSON по шаблону V4.",
      prompt: `Я прикрепляю фотографию моего кота и JSON-шаблон CatCode V4. Создай новый скин CatCode, который визуально повторяет моего кота.

Правила:
1. Корневой schemaVersion должен быть 4. Сохрани структуру JSON: schemaVersion, app, preset, pattern. Не переименовывай и не удаляй ключи шаблона.
2. В preset.name напиши имя кота. В pattern.schemaVersion поставь 4, pattern.pixelResolution оставь строго равным 2.
3. Основной способ рисовать окрас — pattern.markings на целом коте 64x64 (x=0..63, y=0..63) и/или pattern.regionMarkings по частям: head, body, frontPaws, hindPaws, tail, ears. Каждая отметина: {"x": целое, "y": целое, "color": "#RRGGBB"}. Не повторяй одну и ту же пару x/y внутри массива.
4. Заполни цвета: baseColor, earInnerColor, noseColor, markingColor, eyeStyle ("natural" или "solid"), eyeBgColor (заливка/белок), eyeColor (радужка), eyePupilColor, eyeOutlineColor, oddEye, eyeColorLeft, eyeColorRight, eyePupilScale, closedLidColor. Для разных частей можно задать pattern.regionColors (пустая строка = как baseColor). Все цвета в формате #RRGGBB.
5. Передай узнаваемый рисунок шерсти связными областями. Не заполняй весь холст цветом baseColor и не добавляй случайный шум. Не трогай геометрию глаз — только цветовые поля глаз.
6. Не заполняй legacy-массивы частей (head, body, tail, legFl, legFr, legRl, legRr, earL, earR, side). Если нужен блок legacy — оставь его пустым объектом {}. Не создавай новый скин в старой split-part модели.
7. Верни только валидный JSON: без Markdown, пояснений, комментариев и тройных кавычек.`,
    },
    en: {
      title: "Create your cat",
      entry: "Create your cat",
      back: "Back",
      intro: "Turn a photo of your cat into a CatCode V4 skin with an AI assistant.",
      stepPhoto: "Attach a photo of your cat to an AI assistant.",
      stepTemplate: "Download and attach the CatCode V4 JSON template.",
      stepPrompt: "Copy the prompt below and ask the assistant to return only a JSON file.",
      stepImport: "Save the answer as a .json file and import it here.",
      downloadTemplate: "Download JSON template",
      copyPrompt: "Copy prompt",
      importJson: "Import finished cat",
      copied: "Prompt copied. Attach a photo and the JSON template with it.",
      templateSaved: "Template saved. Attach it to the message for the AI assistant.",
      importSuccess: "Done: the skin was added to Imported.",
      importFailed: "The file could not be imported. Check that the AI returned JSON based on the V4 template.",
      prompt: `I am attaching a photo of my cat and a CatCode V4 JSON template. Create a new CatCode skin that visually matches my cat.

Rules:
1. Root schemaVersion must be 4. Preserve the JSON structure: schemaVersion, app, preset, pattern. Do not rename or remove template keys.
2. Put the cat's name in preset.name. Set pattern.schemaVersion to 4 and keep pattern.pixelResolution exactly 2.
3. Primary coat artwork is pattern.markings on the whole-cat 64x64 workspace (x=0..63, y=0..63) and/or pattern.regionMarkings for parts: head, body, frontPaws, hindPaws, tail, ears. Every marking is {"x": integer, "y": integer, "color": "#RRGGBB"}. Never repeat the same x/y pair inside one array.
4. Fill baseColor, earInnerColor, noseColor, markingColor, eyeStyle ("natural" or "solid"), eyeBgColor (fill/sclera), eyeColor (iris), eyePupilColor, eyeOutlineColor, oddEye, eyeColorLeft, eyeColorRight, eyePupilScale, and closedLidColor. Optional pattern.regionColors may tint body parts (empty string = inherit baseColor). Keep every color as #RRGGBB.
5. Recreate the recognizable coat with clean connected regions. Do not flood the whole canvas with baseColor and do not add random pixel noise. Do not invent eye geometry — only use the eye color fields.
6. Do not fill legacy part arrays (head, body, tail, legFl, legFr, legRl, legRr, earL, earR, side). If a legacy object is present, leave it as {}. Do not create a new skin in the retired split-part model.
7. Return valid JSON only, with no Markdown, explanations, comments, or triple-backtick fences.`,
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
    creatorPanel.hidden = false;
    creatorPanel.classList.add("active");
    status.textContent = "";
  }

  function showPresets() {
    creatorPanel?.classList.remove("active");
    if (creatorPanel) creatorPanel.hidden = true;
    editPanel?.classList.remove("active");
    presetsPanel?.classList.add("active");
    const gallery = document.getElementById("gallery-overlay");
    if (gallery) gallery.hidden = false;
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
