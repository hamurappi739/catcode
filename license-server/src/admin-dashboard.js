"use strict";

const state = { licenses: [], issuedKey: "", page: 1, limit: 100, total: 0, activeTotal: 0, hasPreviousPage: false, hasNextPage: false };
const elements = {
  empty: document.querySelector("#empty"),
  issueForm: document.querySelector("#issue-form"),
  issuedKey: document.querySelector("#issued-key"),
  keyDialog: document.querySelector("#key-dialog"),
  licenseList: document.querySelector("#license-list"),
  detailsContent: document.querySelector("#details-content"),
  detailsDialog: document.querySelector("#details-dialog"),
  detailsTitle: document.querySelector("#details-title"),
  summary: document.querySelector("#summary"),
  pageSummary: document.querySelector("#page-summary"),
  previousPage: document.querySelector("#previous-page"),
  nextPage: document.querySelector("#next-page"),
  toast: document.querySelector("#toast"),
};

function date(value) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

function status(value) {
  const names = { active: "Активна", revoked: "Отозвана", expired: "Истекла" };
  const label = names[value] || value;
  const node = document.createElement("span");
  node.className = `status status-${value}`;
  node.textContent = label;
  return node;
}

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined && text !== null) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function button(label, className, action) {
  const result = node("button", label, className);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "request_failed");
  return data;
}

function toast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => { elements.toast.hidden = true; }, 3600);
}

function renderLicenses() {
  elements.licenseList.replaceChildren();
  const active = state.licenses.filter((license) => license.status === "active").length;
  const first = state.total ? (state.page - 1) * state.limit + 1 : 0;
  const last = first ? first + state.licenses.length - 1 : 0;
  elements.summary.textContent = `Показаны ${first}-${last} из ${state.total}; активных: ${state.activeTotal}`;
  elements.pageSummary.textContent = `Страница ${state.page}`;
  elements.previousPage.disabled = !state.hasPreviousPage;
  elements.nextPage.disabled = !state.hasNextPage;
  elements.empty.hidden = state.licenses.length > 0;
  for (const license of state.licenses) {
    const row = document.createElement("tr");
    const prefix = node("td", license.key_prefix, "mono");
    const stateCell = document.createElement("td"); stateCell.append(status(license.status));
    const payment = node("td", license.payment_reference || "-");
    const buyer = node("td", license.buyer_email || "-");
    const devices = node("td", `${license.active_device_count} / ${license.max_devices}`);
    const activation = node("td", date(license.first_activated_at));
    const actions = node("td", undefined, "actions");
    actions.append(button("Подробнее", "secondary", () => showDetails(license.id)));
    row.append(prefix, stateCell, payment, buyer, devices, activation, actions);
    elements.licenseList.append(row);
  }
}

async function refresh(page = state.page) {
  const data = await api(`/admin/api/licenses?page=${page}&limit=${state.limit}`);
  state.licenses = data.licenses;
  state.page = data.page;
  state.total = data.total;
  state.activeTotal = data.activeTotal;
  state.hasPreviousPage = data.hasPreviousPage;
  state.hasNextPage = data.hasNextPage;
  if (!state.licenses.length && state.hasPreviousPage) return refresh(state.page - 1);
  renderLicenses();
}

function detailRow(label, value, className) {
  const fragment = document.createDocumentFragment();
  fragment.append(node("dt", label), node("dd", value || "-", className));
  return fragment;
}

async function revoke(licenseId) {
  if (!window.confirm("Отозвать лицензию? Повторная активация станет невозможна.")) return;
  await api(`/admin/api/licenses/${licenseId}/revoke`, { method: "POST", body: "{}" });
  elements.detailsDialog.close();
  toast("Лицензия отозвана.");
  await refresh();
}

async function resetDevice(licenseId, deviceId) {
  if (!window.confirm("Отвязать устройство? Этот ключ можно будет активировать на другом компьютере.")) return;
  await api(`/admin/api/licenses/${licenseId}/devices/${deviceId}/reset`, { method: "POST", body: "{}" });
  toast("Устройство отвязано.");
  await showDetails(licenseId);
  await refresh();
}

async function showDetails(licenseId) {
  const data = await api(`/admin/api/licenses/${licenseId}`);
  const { license } = data;
  elements.detailsTitle.textContent = `Лицензия ${license.key_prefix}`;
  elements.detailsContent.replaceChildren();
  const grid = node("dl", undefined, "detail-grid");
  grid.append(
    detailRow("UUID", license.id, "mono"), detailRow("Статус", license.status),
    detailRow("Платеж", license.payment_reference), detailRow("Покупатель", license.buyer_email),
    detailRow("Выдана", date(license.created_at)), detailRow("Первая активация", date(license.first_activated_at)),
    detailRow("Последняя связь", date(license.last_seen_at)), detailRow("Устройств", `${license.active_device_count} / ${license.max_devices}`),
    detailRow("Заметка", license.notes),
  );
  elements.detailsContent.append(grid);
  const deviceSection = node("section", undefined, "detail-section");
  deviceSection.append(node("h3", "Устройства"));
  if (!data.devices.length) deviceSection.append(node("p", "Активаций пока не было.", "notice"));
  for (const device of data.devices) {
    const row = node("div", undefined, "device-row");
    const text = node("div");
    text.append(node("strong", device.device_name || "CatCode Windows"), node("p", `${device.app_version || "-"} | ${date(device.last_seen_at)} | ${device.id}`, "notice mono"));
    row.append(text);
    if (!device.deactivated_at && license.status === "active") row.append(button("Отвязать", "secondary", () => resetDevice(license.id, device.id)));
    else row.append(node("span", device.deactivated_at ? "Отвязано" : "Недоступно", "notice"));
    deviceSection.append(row);
  }
  elements.detailsContent.append(deviceSection);
  const eventSection = node("section", undefined, "detail-section");
  eventSection.append(node("h3", "История"));
  for (const event of data.events) {
    const row = node("div", undefined, "event-row");
    row.append(node("strong", event.event_type), node("p", date(event.created_at)));
    eventSection.append(row);
  }
  elements.detailsContent.append(eventSection);
  const controls = node("div", undefined, "actions detail-section");
  if (license.status === "active") controls.append(button("Отозвать лицензию", "danger", () => revoke(license.id)));
  elements.detailsContent.append(controls);
  elements.detailsDialog.showModal();
}

document.querySelector("#refresh").addEventListener("click", () => refresh().catch((error) => toast(`Ошибка: ${error.message}`)));
elements.previousPage.addEventListener("click", () => refresh(state.page - 1).catch((error) => toast(`Ошибка: ${error.message}`)));
elements.nextPage.addEventListener("click", () => refresh(state.page + 1).catch((error) => toast(`Ошибка: ${error.message}`)));
document.querySelectorAll("[data-close]").forEach((control) => control.addEventListener("click", () => document.querySelector(`#${control.dataset.close}`).close()));
document.querySelector("#copy-key").addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.issuedKey);
  toast("Ключ скопирован.");
});
elements.issueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = new FormData(elements.issueForm);
  const submit = elements.issueForm.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const data = await api("/admin/api/licenses", {
      method: "POST",
      body: JSON.stringify({
        paymentReference: fields.get("paymentReference"), buyerEmail: fields.get("buyerEmail"),
        maxDevices: fields.get("maxDevices"), notes: fields.get("notes"),
      }),
    });
    state.issuedKey = data.license.key;
    elements.issuedKey.textContent = data.license.key;
    elements.keyDialog.showModal();
    elements.issueForm.reset();
    elements.issueForm.elements.maxDevices.value = "1";
    await refresh(1);
  } catch (error) { toast(`Ошибка: ${error.message}`); }
  finally { submit.disabled = false; }
});

refresh().catch((error) => { elements.summary.textContent = `Ошибка загрузки: ${error.message}`; });
