(function () {
  if (window.__fctInjectInstalled) return;
  window.__fctInjectInstalled = true;

  // Скрипт живёт в MAIN-мире страницы ради одной задачи: увидеть, чем ответил
  // сервер на InsertTransactions, который отправляет САМА платформа после
  // подтверждения диалога. Из изолированного мира содержимое этих запросов не
  // видно, а по журналу это единственный способ отличить «клик не дошёл»
  // (записи нет вовсе) от «сервер отклонил» (есть HTTP 4xx/5xx).
  //
  // Раньше здесь же собирался payload turbo-захвата и реестр задач из
  // TasksHistory/SSE — всё это удалено вместе с turbo-режимом.

  // Отметка присутствия для самодиагностики. Без этого скрипта захват внешне
  // работает, но каждый успех выглядит как чужой: подтверждения от сервера
  // никто не видит. Изолированный мир проверить это может только через DOM.
  function markBridge() {
    try { document.documentElement.setAttribute("data-fct-bridge", "1"); } catch (e) {}
  }
  if (document.documentElement) markBridge();
  else document.addEventListener("DOMContentLoaded", markBridge, { once: true });

  function postInsertObserved(status) {
    try {
      window.postMessage({
        __fct: true,
        kind: "insert-observed",
        status: status || 0,
        ok: status >= 200 && status < 300
      }, "*");
    } catch (e) {}
  }

  const NativeFetch = window.fetch;
  if (NativeFetch) {
    window.fetch = function (input, init) {
      const p = NativeFetch.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (/InsertTransactions/i.test(String(url))) {
          p.then((resp) => { try { postInsertObserved(resp.status); } catch (e) {} })
            .catch(() => { try { postInsertObserved(0); } catch (e) {} });
        }
      } catch (e) {}
      return p;
    };
  }

  if (typeof XMLHttpRequest === "function") {
    const NativeXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__fctUrl = url;
      return NativeXhrOpen.apply(this, arguments);
    };
    const NativeXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      try {
        if (/InsertTransactions/i.test(String(this.__fctUrl || ""))) {
          this.addEventListener("loadend", function () {
            try { postInsertObserved(this.status); } catch (e) {}
          });
        }
      } catch (e) {}
      return NativeXhrSend.apply(this, arguments);
    };
  }
})();
