"use strict";

const form = document.querySelector("#activation-form");
const keyInput = document.querySelector("#license-key");
const button = document.querySelector("#activate");
const status = document.querySelector("#status");

function messageFor(result) {
  if (result.network) return "Не удалось связаться с сервером лицензий. Проверьте подключение к интернету.";
  if (result.limit) return "Для этого ключа уже использовано максимальное число устройств.";
  if (result.disabled) return "Этот ключ больше не действует.";
  return result.message || "Не удалось активировать ключ. Проверьте его и попробуйте ещё раз.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) return;
  button.disabled = true;
  status.textContent = "Проверяем ключ...";
  try {
    const result = await window.licenseAPI.activate(key);
    if (result && result.ok) {
      status.className = "status success";
      status.textContent = "Лицензия активирована. Открываем CatCode...";
      return;
    }
    status.className = "status error";
    status.textContent = messageFor(result || {});
  } catch {
    status.className = "status error";
    status.textContent = "Не удалось активировать ключ. Попробуйте ещё раз.";
  } finally {
    button.disabled = false;
  }
});

keyInput.focus();
