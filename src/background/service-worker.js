const BADGE_COLOR = "#16a34a";
const BADGE_COLOR_OFF = "#9ca3af";

// Источник правды о захвате — сами вкладки, а не попап: liveEnabled живёт в
// content script и умирает вместе со страницей при перезагрузке. Раньше об
// этом никто не сообщал, и бейдж продолжал показывать ON у выключенного
// расширения. Теперь каждая вкладка сама сообщает своё состояние, а её уход
// (перезагрузка/закрытие) убирает её из набора.
const enabledTabs = new Set();
let grabCount = 0;

function updateBadge() {
  const on = enabledTabs.size > 0;
  if (!on) grabCount = 0;
  chrome.action.setBadgeText({ text: on ? (grabCount > 0 ? String(grabCount) : "ON") : "" });
  chrome.action.setBadgeBackgroundColor({ color: on ? BADGE_COLOR : BADGE_COLOR_OFF });
}

function setTabEnabled(tabId, on) {
  if (!tabId) return;
  if (on) enabledTabs.add(tabId); else enabledTabs.delete(tabId);
  updateBadge();
}

chrome.tabs.onRemoved.addListener((tabId) => setTabEnabled(tabId, false));
// Навигация/перезагрузка уносит content script вместе с состоянием.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") setTabEnabled(tabId, false);
});

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
  } else if (msg.type === "fct-grab-ok") {
    grabCount += 1;
    updateBadge();
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
