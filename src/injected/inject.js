(function () {
  if (window.__fctInjectInstalled) return;
  window.__fctInjectInstalled = true;

  const ID_KEYS = ["taskId", "task_id", "id", "_id", "uuid", "guid", "loadId", "orderId"];
  const TYPE_KEYS = ["taskType", "task_type", "type", "kind", "category", "serviceType", "name"];
  const EVENT_KEYS = ["event", "type", "action", "messageType", "op"];
  const PAYLOAD_KEYS = ["data", "payload", "result", "task", "body", "params"];
  const TASK_RE = /task|load|order|job/i;
  const CREATED_RE = /new|creat|add|open|assign|publish|appear|incoming/i;
  const MAX_DEPTH = 4;
  const REG_LIMIT = 800;
  // Платформа шлёт SSE именованными событиями (event: taskUpsert), не дефолтным
  // "message" — без этого списка decodeData() никогда не вызывается на живых кадрах.
  const SSE_EVENT_NAMES = ["message", "taskUpsert"];

  function post(task) {
    try {
      window.postMessage({ __fct: true, kind: "ws-task", task }, "*");
    } catch (e) {}
  }

  function pick(obj, keys) {
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
    }
    return undefined;
  }

  function firstStr(obj, keys) {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v) return v;
      if (typeof v === "number") return String(v);
    }
    return "";
  }

  function normTxt(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function idName(re, s) {
    const m = String(s == null ? "" : s).match(re);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  }

  function toMs(v) {
    if (v == null || v === "") return 0;
    const n = Number(v);
    if (isFinite(n) && n > 0) return n >= 1e12 ? n : (n >= 1e9 ? n * 1000 : 0);
    const p = Date.parse(String(v));
    return isFinite(p) ? p : 0;
  }

  function typeKeyOf(str) {
    return Array.from(new Set(
      String(str == null ? "" : str)
        .split(";")
        .map(s => s.trim().toLowerCase())
        .filter(s => s && !/^\+\d+$/.test(s))
    )).sort().join(" ");
  }

  function reg() {
    if (!window.__fctTaskReg) window.__fctTaskReg = new Map();
    return window.__fctTaskReg;
  }

  function harvest(obj, depth) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const x of obj) harvest(x, depth);
      return;
    }
    if (depth > 6) return;
    const tid = firstStr(obj, ["taskId", "TaskId", "task_id"]);
    const cid = firstStr(obj, ["companyId", "CompanyId", "PortalCompanyId"]);
    const did = firstStr(obj, ["driverId", "DriverId", "portalDriverId", "PortalDriverId"]);
    if (tid && cid && did) {
      const m = reg();
      if (!m.has(tid)) {
        let companyRaw = null;
        let driverRaw = null;
        if (obj.company && typeof obj.company === "object") companyRaw = obj.company;
        else if (obj.Company && typeof obj.Company === "object") companyRaw = obj.Company;
        const di = obj.driversInfo || {};
        if (di.mainDriver && typeof di.mainDriver === "object") driverRaw = di.mainDriver;
        else if (obj.driver && typeof obj.driver === "object") driverRaw = obj.driver;
        else if (obj.portalDriver && typeof obj.portalDriver === "object") driverRaw = obj.portalDriver;
        const cdNum = toMs(obj.createDate != null ? obj.createDate :
          obj.CreateDate != null ? obj.CreateDate :
          obj.createDateMs != null ? obj.createDateMs : 0);
        const tasksStr = firstStr(obj, ["tasks", "Tasks"]);
        m.set(tid, {
          taskId: tid,
          companyId: cid,
          companyName: firstStr(obj, ["companyName", "CompanyName"]) ||
            ((companyRaw && (companyRaw.name || companyRaw.Name)) || "") ||
            idName(/^company:\s*(.+)$/i, cid),
          companyRaw,
          portalId: firstStr(obj, ["portalId", "PortalId"]),
          portalName: firstStr(obj, ["portalName", "PortalName"]) ||
            ((companyRaw && (companyRaw.portal || companyRaw.Portal)) || ""),
          driverId: did,
          driverName: firstStr(obj, ["driverName", "DriverName"]) ||
            [(driverRaw && driverRaw.firstName), (driverRaw && driverRaw.lastName)].filter(Boolean).join(" ") ||
            idName(/^(?:user|driver):\s*(.+)$/i, did),
          driverRaw,
          createDate: cdNum,
          tasksStr,
          tasksKey: typeKeyOf(tasksStr),
          vehicleId: firstStr(obj, ["vehicleId", "VehicleId"]),
          vehicleName: firstStr(obj, ["vehicleName", "VehicleName"]),
          grade: firstStr(obj, ["grade", "Grade"]),
          source: firstStr(obj, ["source", "Source"]),
          lastPickupStr: firstStr(obj, ["lastPickup", "LastPickup"]),
          status: firstStr(obj, ["status", "Status"]),
          comment: firstStr(obj, ["comment", "Comment"])
        });
        if (m.size > REG_LIMIT) {
          m.delete(m.keys().next().value);
        }
        // Живой пуш уже несёт статус/исполнителя — если заявка свободна,
        // сигналим content.js сразу, не дожидаясь перерисовки DOM.
        const st = firstStr(obj, ["status", "Status"]);
        const execId = firstStr(obj, ["executorUserId", "ExecutorUserId"]);
        if (/not\s*started/i.test(st) && !execId) {
          post({ id: tid, type: tasksStr });
        }
      }
    }
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === "object") harvest(v, depth + 1);
    }
  }

  function extractFromObject(obj, depth) {
    if (!obj || typeof obj !== "object" || depth > MAX_DEPTH) return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = extractFromObject(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const id = pick(obj, ID_KEYS);
    const type = pick(obj, TYPE_KEYS);
    if (id != null && (typeof id === "string" || typeof id === "number")) {
      return {
        id: String(id),
        type: type != null && typeof type !== "object" ? String(type) : "",
        raw: obj
      };
    }
    const ev = pick(obj, EVENT_KEYS);
    if (ev != null && typeof ev === "string" && TASK_RE.test(ev) && CREATED_RE.test(ev)) {
      for (const pk of PAYLOAD_KEYS.concat(Object.keys(obj))) {
        if (obj[pk] && typeof obj[pk] === "object") {
          const found = extractFromObject(obj[pk], depth + 1);
          if (found) return found;
        }
      }
      return null;
    }
    for (const k in obj) {
      if (obj[k] && typeof obj[k] === "object") {
        const found = extractFromObject(obj[k], depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  function handleText(text) {
    if (!text || text.length > 3000000) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return;
    }
    harvest(parsed, 0);
    const found = extractFromObject(parsed, 0);
    if (found) post(found);
  }

  function captureResponseText(url, text) {
    try {
      if (!/TasksHistory/i.test(String(url))) return;
      handleText(text);
    } catch (e) {}
  }

  function postInsertObserved(status, reqBody) {
    try {
      window.postMessage({
        __fct: true,
        kind: "insert-observed",
        status: status || 0,
        ok: status >= 200 && status < 300,
        reqHead: String(reqBody || "").slice(0, 600)
      }, "*");
    } catch (e) {}
  }

  function decodeData(data) {
    try {
      if (typeof data === "string") return handleText(data);
      if (data instanceof ArrayBuffer) return handleText(new TextDecoder().decode(new Uint8Array(data)));
      if (ArrayBuffer.isView(data)) return handleText(new TextDecoder().decode(data));
      if (data instanceof Blob) {
        data.text().then(handleText).catch(() => {});
      }
    } catch (e) {}
  }

  const NativeWebSocket = window.WebSocket;

  if (NativeWebSocket) {
    function PatchedWebSocket(url, protocols) {
      const ws = protocols !== undefined ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      try {
        ws.addEventListener("message", (e) => decodeData(e.data));
      } catch (e) {}
      return ws;
    }

    PatchedWebSocket.prototype = NativeWebSocket.prototype;
    PatchedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    PatchedWebSocket.OPEN = NativeWebSocket.OPEN;
    PatchedWebSocket.CLOSING = NativeWebSocket.CLOSING;
    PatchedWebSocket.CLOSED = NativeWebSocket.CLOSED;

    try {
      Object.defineProperty(window, "WebSocket", { value: PatchedWebSocket, writable: true, configurable: true });
    } catch (e) {}
  }

  const NativeEventSource = window.EventSource;

  if (NativeEventSource) {
    function PatchedEventSource(url, cfg) {
      const es = cfg !== undefined ? new NativeEventSource(url, cfg) : new NativeEventSource(url);
      for (const evtName of SSE_EVENT_NAMES) {
        try {
          es.addEventListener(evtName, (e) => decodeData(e.data));
        } catch (e) {}
      }
      return es;
    }

    PatchedEventSource.prototype = NativeEventSource.prototype;
    PatchedEventSource.CONNECTING = NativeEventSource.CONNECTING;
    PatchedEventSource.OPEN = NativeEventSource.OPEN;
    PatchedEventSource.CLOSED = NativeEventSource.CLOSED;

    try {
      Object.defineProperty(window, "EventSource", { value: PatchedEventSource, writable: true, configurable: true });
    } catch (e) {}
  }

  const NativeFetch = window.fetch;
  if (NativeFetch) {
    window.fetch = function (input, init) {
      const p = NativeFetch.apply(this, arguments);
      try {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (/TasksHistory/i.test(String(url))) {
          p.then((resp) => {
            try {
              const cl = resp.clone();
              cl.text().then((txt) => captureResponseText(url, txt)).catch(() => {});
            } catch (e) {}
          }).catch(() => {});
        } else if (/InsertTransactions/i.test(String(url))) {
          const rb = init && typeof init.body === "string" ? init.body : "";
          p.then((resp) => { try { postInsertObserved(resp.status, rb); } catch (e) {} })
            .catch(() => { try { postInsertObserved(0, rb); } catch (e) {} });
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
    XMLHttpRequest.prototype.send = function (body) {
      try {
        const u = String(this.__fctUrl || "");
        if (/TasksHistory/i.test(u)) {
          this.addEventListener("load", function () {
            try {
              if (!this.responseType || this.responseType === "text") {
                captureResponseText(this.__fctUrl, this.responseText);
              }
            } catch (e) {}
          });
        } else if (/InsertTransactions/i.test(u)) {
          const rb = typeof body === "string" ? body : "";
          this.addEventListener("loadend", function () {
            try { postInsertObserved(this.status, rb); } catch (e) {}
          });
        }
      } catch (e) {}
      return NativeXhrSend.apply(this, arguments);
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__fct !== true || msg.kind !== "turbo-req") return;

    if (msg.sig) {
      let rec = null;
      let size = 0;
      try { rec = lookupBySig(msg.sig); size = reg().size; } catch (e) {}
      window.postMessage({ __fct: true, kind: "turbo-res", reqId: msg.reqId, found: !!rec, rec, regSize: size }, "*");
      return;
    }

    const opts = msg.options || {};
    const init = { method: opts.method || "POST", credentials: "include" };
    if (opts.headers) init.headers = opts.headers;
    try {
      const tok = localStorage.getItem("auth") || "";
      if (tok) init.headers = Object.assign({ Authorization: "Bearer " + tok }, init.headers || {});
    } catch (e) {}
    if (opts.body != null) init.body = opts.body;
    fetch(msg.url, init)
      .then(async (r) => {
        let body = "";
        try { body = (await r.text()).slice(0, 800); } catch (e) {}
        window.postMessage({ __fct: true, kind: "turbo-res", reqId: msg.reqId, ok: r.ok, status: r.status, body }, "*");
      })
      .catch((err) => {
        window.postMessage({
          __fct: true,
          kind: "turbo-res",
          reqId: msg.reqId,
          ok: false,
          error: String((err && err.message) || err)
        }, "*");
      });
  });

  function lookupBySig(sig) {
    const m = reg();
    if (!m.size) return null;
    const c = normTxt(sig.c);
    const d = normTxt(sig.d);
    const t = Number(sig.t) || 0;
    const tk = normTxt(sig.tk);
    let best = null;
    let bestScore = -1;
    let bestDiff = Infinity;
    m.forEach((r) => {
      let score = 0;
      if (c) {
        const cn = normTxt(r.companyName);
        if (!cn) return;
        if (cn !== c && cn.indexOf(c) === -1 && c.indexOf(cn) === -1) return;
        score += 4;
      }
      if (d) {
        const dn = normTxt(r.driverName);
        if (!dn || (dn.indexOf(d) === -1 && d.indexOf(dn) === -1)) return;
        score += 2;
      }
      if (tk && r.tasksKey) {
        const wordsOf = s => s.split(/\s+/).filter(Boolean).sort().join(" ");
        const tkn = wordsOf(tk);
        const rkn = wordsOf(r.tasksKey);
        if (rkn !== tkn &&
            rkn.indexOf(tkn) === -1 && tkn.indexOf(rkn) === -1) return;
        score += 3;
      }
      const diff = t && r.createDate ? Math.abs(r.createDate - t) : 0;
      if (score > bestScore || (score === bestScore && diff < bestDiff)) {
        bestScore = score;
        bestDiff = diff;
        best = r;
      }
    });
    if (!best) return null;
    if (t && best.createDate && bestDiff > 180000 && bestScore < 9) return null;
    return best;
  }

  window.__fctTurboLookup = lookupBySig;
  window.__fctHarvestText = handleText;
})();
