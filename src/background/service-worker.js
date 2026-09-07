const BADGE_COLOR = "#16a34a";
const BADGE_COLOR_OFF = "#9ca3af";

const BADGE_COLOR_BAD = "#ef4444";

const TABS_URL = "https://alpha.flowconnect-group.com/*";
const SESSION_KEY = "enabledTabs";
const CAPTURE_KEY = "captureOn";
const HEALTH_KEY = "health";

// Источник правды о захвате — сами вкладки: liveEnabled живёт в content script
// и умирает вместе со страницей при перезагрузке.
//
// Набор ОБЯЗАН переживать сон service worker'а. MV3 усыпляет воркер, и когда он
// просыпается на любом событии, память пуста — прежняя версия в этот момент
// стирала бейдж у работающего захвата. Поэтому набор хранится в
// chrome.storage.session (живёт до закрытия браузера, разрешений не требует).
let enabledTabs = new Set();
let restored = false;
let grabCount = 0;
let healthBad = false;

async function restoreTabs() {
  if (restored) return;
  restored = true;
  try {
    const data = await chrome.storage.session.get(SESSION_KEY);
    const ids = Array.isArray(data[SESSION_KEY]) ? data[SESSION_KEY] : [];
    for (const id of ids) {
      // вкладки могли закрыться, пока воркер спал
      try { await chrome.tabs.get(id); enabledTabs.add(id); } catch (e) {}
    }
  } catch (e) {}
}

// Кроме набора вкладок пишем ОДИН общий флаг в storage.local. Это стоп-кран:
// storage.onChanged доходит до каждой живой вкладки сам, без sendMessage,
// который может не дойти (вкладка в фоне, гонка при закрытии попапа).
async function persistTabs() {
  try { await chrome.storage.session.set({ [SESSION_KEY]: [...enabledTabs] }); } catch (e) {}
  try { await chrome.storage.local.set({ [CAPTURE_KEY]: enabledTabs.size > 0 }); } catch (e) {}
}

function paintBadge() {
  const on = enabledTabs.size > 0;
  if (!on) grabCount = 0;
  // Поломка селекторов важнее счётчика: без красного «!» она незаметна, пока
  // не кончится смена. При выключенном захвате не тревожим — чинить нечего.
  if (on && healthBad) {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR_BAD });
    return;
  }
  chrome.action.setBadgeText({ text: on ? (grabCount > 0 ? String(grabCount) : "ON") : "" });
  chrome.action.setBadgeBackgroundColor({ color: on ? BADGE_COLOR : BADGE_COLOR_OFF });
}

async function setTabEnabled(tabId, on) {
  if (!tabId) return;
  await restoreTabs();
  if (on) enabledTabs.add(tabId); else enabledTabs.delete(tabId);
  await persistTabs();
  paintBadge();
}

// Рассылка живёт здесь, а не в попапе. Попап уничтожается сразу, как только
// закрывается, обрывая незавершённые await — из-за этого часть вкладок не
// получала команду «выключить», и захват продолжал работать при выключенном
// на вид слайдере. Воркер так не умирает.
async function broadcastEnabled(value) {
  await restoreTabs();
  // Включение снимает прошлую тревогу: иначе диагноз, поставленный вчера,
  // светит красным вечно. Если поломка на месте, сторож поднимет её снова.
  if (value && healthBad) {
    healthBad = false;
    try { await chrome.storage.local.set({ [HEALTH_KEY]: { ok: true, reason: "", ts: Date.now() } }); } catch (e) {}
  }
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: TABS_URL }); } catch (e) {}
  await Promise.all(tabs.map(async (t) => {
    if (!t.id) return;
    try {
      await chrome.tabs.sendMessage(t.id, { type: "fct-set-enabled", value: !!value });
      if (value) enabledTabs.add(t.id); else enabledTabs.delete(t.id);
    } catch (e) {
      // во вкладке нет content script (открыта до установки) — она и не ловит
      enabledTabs.delete(t.id);
    }
  }));
  await persistTabs();
  paintBadge();
  return { ok: true, enabled: enabledTabs.size > 0, tabs: tabs.length };
}

// Сколько вкладок реально в захвате — попап рисует слайдер по этому ответу.
async function enabledState() {
  await restoreTabs();
  return { ok: true, enabled: enabledTabs.size > 0, count: enabledTabs.size };
}

chrome.tabs.onRemoved.addListener((tabId) => { setTabEnabled(tabId, false); });
// Навигация/перезагрузка уносит content script вместе с состоянием.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") setTabEnabled(tabId, false);
});

// Диагноз ставят вкладки (они видят разметку), а рисует его бейджем воркер.
// storage.onChanged будит воркер сам, отдельного сообщения не нужно.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[HEALTH_KEY]) return;
  const v = changes[HEALTH_KEY].newValue;
  healthBad = !!(v && v.ok === false);
  restoreTabs().then(paintBadge);
});

// Ctrl+Shift+Y: выключить захват, не открывая попап. Клавишу можно сменить в
// chrome://extensions/shortcuts.
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd !== "toggle-capture") return;
  restoreTabs().then(() => broadcastEnabled(enabledTabs.size === 0));
});

// Воркер мог только что проснуться, а мог стартовать после перезагрузки
// расширения (тогда набор пуст, и стоп-кран обязан встать в «выкл»).
restoreTabs()
  .then(async () => {
    try {
      const d = await chrome.storage.local.get(HEALTH_KEY);
      healthBad = !!(d[HEALTH_KEY] && d[HEALTH_KEY].ok === false);
    } catch (e) {}
  })
  .then(() => { persistTabs(); paintBadge(); });

async function trustedClick(tabId, x, y) {
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
  } catch (e) {
    return { ok: false, error: "attach: " + ((e && e.message) || e) };
  }
  try {
    const base = { x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 };
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", Object.assign({ type: "mouseMoved" }, base));
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", Object.assign({ type: "mousePressed" }, base));
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", Object.assign({ type: "mouseReleased" }, base));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "dispatch: " + ((e && e.message) || e) };
  } finally {
    try { await chrome.debugger.detach(target); } catch (e) {}
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "fct-tab-state") {
    setTabEnabled(sender && sender.tab && sender.tab.id, !!msg.enabled);
  } else if (msg.type === "fct-set-enabled-all") {
    broadcastEnabled(!!msg.value).then((r) => { try { sendResponse(r); } catch (e) {} });
    return true;
  } else if (msg.type === "fct-enabled-state") {
    enabledState().then((r) => { try { sendResponse(r); } catch (e) {} });
    return true;
  } else if (msg.type === "fct-grab-ok") {
    grabCount += 1;
    restoreTabs().then(paintBadge);
  } else if (msg.type === "fct-trusted-click") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (!tabId) {
      try { sendResponse({ ok: false, error: "нет tabId" }); } catch (e) {}
      return;
    }
    trustedClick(tabId, Number(msg.x) || 0, Number(msg.y) || 0).then((r) => {
      try { sendResponse(r); } catch (e) {}
    });
    return true;
  }
});
