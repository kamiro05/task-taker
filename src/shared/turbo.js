globalThis.FCT = globalThis.FCT || {};

// Тонкий клиент turbo-захвата. Вся сборка payload живёт в MAIN-мире
// (src/injected/inject.js): ей нужны компания из Portals, водитель из
// PortalDrivers и журнал HOS-событий — сотни КБ, которые бессмысленно гонять
// через postMessage-мост. Здесь остаётся только запрос-ответ.
FCT.Turbo = (function () {
  let seq = 0;
  const pending = new Map();

  function spec() {
    return (FCT.CONFIG && FCT.CONFIG.turbo) || null;
  }

  function isAvailable() {
    const t = spec();
    return !!(t && t.urlTemplate);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const m = event.data;
    if (!m || m.__fct !== true || m.kind !== "turbo-res") return;
    const p = pending.get(m.reqId);
    if (!p) return;
    pending.delete(m.reqId);
    clearTimeout(p.timer);
    p.resolve(m);
  });

  function requestViaPage(req, timeoutMs) {
    return new Promise((resolve) => {
      const reqId = "r" + (++seq) + Math.random().toString(36).slice(2, 8);
      const timer = setTimeout(() => {
        pending.delete(reqId);
        resolve({ ok: false, error: "таймаут моста" });
      }, timeoutMs || 6000);
      pending.set(reqId, { resolve, timer });
      try {
        window.postMessage(Object.assign({ __fct: true, reqId }, req), "*");
      } catch (e) {
        clearTimeout(timer);
        pending.delete(reqId);
        resolve({ ok: false, error: "нет моста в страницу" });
      }
    });
  }

  // taskId здесь — настоящий TaskId платформы: он есть и у SSE-детекта, и в
  // реестре, собранном из TasksHistory. DOM-путь своего id платформы не знает
  // (там хеш строки), поэтому для него сначала ищем запись по сигнатуре.
  async function resolveTaskId(task, sig) {
    if (task && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(task.id))) return String(task.id);
    const t = spec();
    const q = await requestViaPage({ kind: "turbo-req", sig: sig || {} }, (t && t.timeoutMs) || 6000);
    return q && q.found && q.rec ? String(q.rec.taskId) : "";
  }

  async function grab(row, task, sig) {
    const t = spec();
    if (!isAvailable()) return { ok: false, error: "не настроен" };

    const taskId = await resolveTaskId(task, sig);
    if (!taskId) return { ok: false, error: "задача не найдена в реестре" };

    const res = await requestViaPage({
      kind: "turbo-grab",
      taskId,
      rawTypes: (task && task.rawTypes) || [],
      portalsInProcess: t.portalsInProcess || []
    }, t.grabTimeoutMs || 25000);

    // shared — результат параллельного захвата той же задачи (см. turboGrab в
    // inject.js). Флаг обязан дожить до content.js: по нему решается, кликать
    // ли фолбэком.
    if (!res.ok) {
      return { ok: false, error: res.error || ("HTTP " + res.status), status: res.status, shared: !!res.shared };
    }
    return {
      ok: true, status: res.status, events: res.events,
      shared: !!res.shared, transactionId: res.transactionId || ""
    };
  }

  return { isAvailable, grab };
})();
