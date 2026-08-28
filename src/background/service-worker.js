const BADGE_COLOR = "#16a34a";
const BADGE_COLOR_OFF = "#9ca3af";

let swEnabled = false;
let grabCount = 0;

function updateBadge(enabled, count) {
  const text = enabled ? (count > 0 ? String(count) : "ON") : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? BADGE_COLOR : BADGE_COLOR_OFF });
}

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
  if (msg.type === "fct-enabled") {
    swEnabled = !!msg.value;
    if (!swEnabled) grabCount = 0;
    updateBadge(swEnabled, grabCount);
  } else if (msg.type === "fct-grab-ok") {
    grabCount += 1;
    updateBadge(swEnabled, grabCount);
  } else if (msg.type === "fct-open-transaction") {
    // Turbo берёт задачу без диалога, поэтому страницу транзакции платформа не
    // открывает — делаем это сами. Фоном (active: false), чтобы захват следующих
    // заявок не сбивался переключением вкладки.
    const url = String((msg && msg.url) || "");
    if (/^https:\/\/alpha\.flowconnect-group\.com\/transaction\//.test(url)) {
      try { chrome.tabs.create({ url, active: false }); } catch (e) {}
    }
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
