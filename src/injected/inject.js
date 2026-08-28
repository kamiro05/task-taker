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
        const portalNameVal = firstStr(obj, ["portalName", "PortalName"]) ||
          ((companyRaw && (companyRaw.portal || companyRaw.Portal)) || "");
        m.set(tid, {
          taskId: tid,
          companyId: cid,
          companyName: firstStr(obj, ["companyName", "CompanyName"]) ||
            ((companyRaw && (companyRaw.name || companyRaw.Name)) || "") ||
            idName(/^company:\s*(.+)$/i, cid),
          companyRaw,
          portalId: firstStr(obj, ["portalId", "PortalId"]),
          portalName: portalNameVal,
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
          post({ id: tid, type: tasksStr, portal: String(portalNameVal || "").toLowerCase() });
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

  // ---------------------------------------------------------------------------
  // Сборка payload InsertTransactions — целиком в MAIN-мире.
  //
  // Платформа перед своим POST делает подготовительную цепочку (снято с живого
  // успешного запроса): компания из Portals, водитель из PortalDrivers, журнал
  // HOS-событий и daily-логи из FlowProvider. Прежняя версия слала вместо всего
  // этого «скелет» с пустыми полями и provider = ИМЯ_ПОРТАЛА в верхнем регистре
  // (для K1 TRANSFREIGHT: "ROYAL" вместо реального "HOS247") — сервер отвечал 504.
  // Данные здесь весят сотни КБ, поэтому payload строится и отправляется прямо
  // тут, а не гоняется через postMessage-мост.
  // ---------------------------------------------------------------------------

  const API_BASE = "https://api.flowconnect-group.com";
  const PORTALS_TTL_MS = 30 * 60 * 1000;
  const DRIVERS_TTL_MS = 10 * 60 * 1000;
  // Токен провайдера живёт недолго — держим запас и обновляем чаще водителей.
  const TOKEN_TTL_MS = 4 * 60 * 1000;

  let companyMapPromise = null;
  let companyMapAt = 0;
  // Кеши хранят ПРОМИСЫ, а не результаты: если предпрогрев уже начал запрос,
  // захват подхватит тот же промис вместо второго такого же обращения к API.
  const driversCache = new Map();
  const tokenCache = new Map();

  function cached(store, key, ttl, make) {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.p;
    const p = make().catch((e) => { store.delete(key); throw e; });
    store.set(key, { at: Date.now(), p });
    return p;
  }

  function authToken() {
    try { return localStorage.getItem("auth") || ""; } catch (e) { return ""; }
  }

  async function apiGet(path, extraHeaders) {
    const headers = Object.assign({ Authorization: "Bearer " + authToken() }, extraHeaders || {});
    // ВАЖНО: без credentials. api.flowconnect-group.com — другой домен, и на
    // кросс-доменный запрос с куками шлюз мгновенно отвечает 504 (проверено:
    // тот же URL и токен, с credentials — 504 за ~120 мс, без — 200).
    // Angular тоже шлёт запросы без кук, авторизация только по Bearer.
    const r = await fetch(API_BASE + path, { headers });
    if (!r.ok) throw new Error(path.split("?")[0] + " → HTTP " + r.status);
    return await r.json();
  }

  // Portals — единственный источник полного объекта компании (provider, dotNumber,
  // terminals, portalEmail…). ~3 МБ, поэтому грузится один раз и кешируется.
  function loadCompanyMap() {
    if (companyMapPromise && Date.now() - companyMapAt < PORTALS_TTL_MS) return companyMapPromise;
    companyMapAt = Date.now();
    companyMapPromise = apiGet("/api/FlowManage/Portals").then((portals) => {
      const m = new Map();
      for (const p of (portals || [])) {
        for (const c of (p.Companies || [])) {
          const key = c && (c.companyId || c.id || c._id);
          if (key) m.set(String(key), c);
        }
      }
      return m;
    }).catch((e) => { companyMapPromise = null; throw e; });
    return companyMapPromise;
  }

  function loadUsers(rec) {
    return cached(driversCache, rec.portalId + "|" + rec.companyId, DRIVERS_TTL_MS, () => {
      const q = "?PortalId=" + encodeURIComponent(rec.portalId) +
        "&PortalCompanyId=" + encodeURIComponent(rec.companyId) +
        "&GetUsers=true&GetVehicles=true&GetLatestDriverStatuses=true";
      return apiGet("/api/FlowManage/PortalDrivers" + q).then((res) => (res && res.Users) || []);
    });
  }

  async function getMainDriver(rec) {
    const users = await loadUsers(rec);
    return users.find((u) => u && String(u._id) === String(rec.driverId)) || null;
  }

  function getProviderToken(rec) {
    return cached(tokenCache, rec.portalId + "|" + rec.companyId, TOKEN_TTL_MS, () => {
      const q = "?PortalId=" + encodeURIComponent(rec.portalId) +
        "&PortalCompanyId=" + encodeURIComponent(rec.companyId);
      return apiGet("/api/FlowManage/CompanyAccessToken" + q);
    });
  }

  // Предпрогрев: токен и список водителей — самая дорогая часть подготовки
  // (~1.7 с из ~2 с). Оба запроса не зависят от конкретной задачи, только от
  // компании, поэтому их можно взять заранее. Дальше захват просто подхватит
  // готовые промисы из кеша.
  function prewarmCompany(rec) {
    if (!rec || !rec.portalId || !rec.companyId) return;
    try { getProviderToken(rec).catch(() => {}); } catch (e) {}
    try { loadUsers(rec).catch(() => {}); } catch (e) {}
  }

  // Фоновый прогрев самых свежих компаний реестра. Идёт медленно и с потолком,
  // чтобы не долбить API: он уже показывал заградительные ответы под нагрузкой.
  let prewarmTimer = null;
  function startBackgroundPrewarm(limit, everyMs) {
    if (prewarmTimer) return;
    let done = 0;
    prewarmTimer = setInterval(() => {
      if (done >= limit) { clearInterval(prewarmTimer); prewarmTimer = null; return; }
      const seen = new Set();
      const recs = Array.from(reg().values()).reverse();
      for (const rec of recs) {
        const key = rec.portalId + "|" + rec.companyId;
        if (seen.has(key) || tokenCache.has(key)) continue;
        seen.add(key);
        prewarmCompany(rec);
        done++;
        return;
      }
      clearInterval(prewarmTimer);
      prewarmTimer = null;
    }, everyMs);
  }

  // Внешние порталы (eld88 и т.п.) адресуют компанию и водителя обычными UUID,
  // тогда как у платформы это префиксные short-id вида "Company:75peTSLzIdSG…".
  // Преобразование снято один в один с бандла платформы (eld88Handler):
  // base62-разбор → 16 байт little-endian → UUID с перестановкой первых трёх
  // групп. Проверено: Company:75peTSLzIdSGvtvtWj2bNc →
  // 49f6f44c-3343-4eb0-9b0b-3b5d91d816e9 — совпало с URL, который платформа
  // открыла сама при клик-захвате.
  const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  function stripPrefix(s) {
    if (!s) return "";
    const k = String(s).indexOf(":");
    return k !== -1 ? String(s).substring(k + 1) : String(s);
  }

  function shortIdToUuid(short) {
    let acc = 0n;
    for (const ch of String(short)) {
      const v = B62.indexOf(ch);
      if (v === -1) return "";
      acc = 62n * acc + BigInt(v);
    }
    const bytes = [];
    let x = acc;
    while (x > 0n) { bytes.push(Number(x % 256n)); x /= 256n; }
    while (bytes.length < 16) bytes.push(0);
    const h = bytes.slice(0, 16).map((b) => b.toString(16).padStart(2, "0"));
    return h[3] + h[2] + h[1] + h[0] + "-" + h[5] + h[4] + "-" + h[7] + h[6] +
      "-" + h[8] + h[9] + "-" + h[10] + h[11] + h[12] + h[13] + h[14] + h[15];
  }

  function externalPortalUrl(rec, templates) {
    const tpl = templates && templates[String(rec.portalName || "").toLowerCase()];
    if (!tpl) return "";
    const co = shortIdToUuid(stripPrefix(rec.companyId));
    const drv = shortIdToUuid(stripPrefix(rec.driverId));
    if (!co || !drv) return "";
    return tpl.replace("{company}", co).replace("{driver}", drv);
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "/" + pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()); }

  // Диапазоны сняты с живого запроса: RangeDate* = последние 8 дней (пресет
  // «Last 8»), HosEvents берётся на 3 дня шире назад, daily-логи — ровно по Range.
  function providerData(rec, company, providerToken, bgnStr, endStr, hosStartStr) {
    const H = { "X-Provider-Token": providerToken };
    const common = "Provider=" + encodeURIComponent(company.provider || "") +
      "&CompanyId=" + encodeURIComponent(rec.companyId) +
      "&DriverId=" + encodeURIComponent(rec.driverId);
    const evQ = "?" + common + "&StartDate=" + encodeURIComponent(hosStartStr) + "&EndDate=" + encodeURIComponent(endStr);
    const dlQ = "?" + common + "&StartDate=" + encodeURIComponent(bgnStr) + "&EndDate=" + encodeURIComponent(endStr);
    const pick = (r) => (r && r.data) || [];
    return Promise.all([
      apiGet("/api/FlowProvider/HosEvents" + evQ, H).then(pick).catch(() => []),
      apiGet("/api/FlowProvider/DailyLog" + dlQ, H).then(pick).catch(() => []),
      apiGet("/api/FlowProvider/DailyLogSummaries" + dlQ, H).then(pick).catch(() => [])
    ]);
  }

  const emptyChanges = () => ({ changesCount: 0, steps: [], changedEvents: [], createdEvents: [], deletedEvents: [] });

  // Одну задачу могут независимо принести два пути: SSE-детект (id = TaskId
  // платформы) и DOM-детект (id = хеш строки). Их локи в content.js по разным
  // ключам друг друга не видят, поэтому единственная точка, где оба сходятся с
  // уже разрешённым TaskId — здесь. Без этого рабочий turbo создаёт ДВЕ
  // транзакции на одну заявку.
  // Второй путь не отбрасываем, а подписываем на результат первого: если turbo
  // уже летит по этому TaskId, оба получают один и тот же исход. Так DOM-путь
  // не кликает по заявке, которую turbo уже взял (платформа отвечает на такой
  // клик HTTP 400 и диалог остаётся висеть), но при ПРОВАЛЕ turbo фолбэк на
  // клик по-прежнему отрабатывает.
  const grabInFlight = new Map();
  const grabDone = new Set();

  async function turboGrab(msg) {
    const rec = reg().get(String(msg.taskId));
    if (!rec) return { ok: false, error: "задача не найдена в реестре (" + reg().size + " зап.)" };

    const tid = String(msg.taskId);
    if (grabDone.has(tid)) return { ok: true, shared: true, status: 200 };

    const running = grabInFlight.get(tid);
    if (running) {
      const res = await running;
      return Object.assign({}, res, { shared: true });
    }

    const p = turboGrabInner(msg, rec)
      .then((res) => { if (res.ok) grabDone.add(tid); return res; })
      .catch((e) => ({ ok: false, error: String((e && e.message) || e).slice(0, 200) }));
    grabInFlight.set(tid, p);
    try {
      return await p;
    } finally {
      grabInFlight.delete(tid);
    }
  }

  async function turboGrabInner(msg, rec) {

    const map = await loadCompanyMap();
    const company = map.get(String(rec.companyId));
    if (!company) return { ok: false, error: "компания не найдена в Portals" };

    const now = Date.now();
    const endStr = ymd(new Date(now));
    const bgnStr = ymd(new Date(now - 8 * 86400000));
    const hosStartStr = ymd(new Date(now - 11 * 86400000));

    // Водитель не зависит от токена — тянем их параллельно, а не по очереди.
    const [mainDriver, providerToken] = await Promise.all([
      getMainDriver(rec).catch(() => null),
      getProviderToken(rec)
    ]);
    if (!mainDriver) return { ok: false, error: "водитель не найден в PortalDrivers" };

    // includeStartData=false шлёт транзакцию без HOS-журнала: экономит три
    // запроса (~1 с), но в истории транзакции не будет снимка логов, который
    // платформа туда кладёт. Включается осознанно.
    const withStart = msg.includeStartData !== false;
    const [events, dailyLog, dailyLogSum] = withStart
      ? await providerData(rec, company, providerToken, bgnStr, endStr, hosStartStr)
      : [[], [], []];

    const inProc = (msg.portalsInProcess || []).some(
      (p) => String(p).toLowerCase() === String(rec.portalName || "").toLowerCase()
    );
    const rawTypes = (msg.rawTypes && msg.rawTypes.length ? msg.rawTypes : String(rec.tasksStr || "").split(";"))
      .map((s) => String(s).trim())
      .filter((s) => s && !/^\+\d+$/.test(s));

    const hist = {
      otherEvents: [],
      company,
      driversInfo: { mainDriver },
      changes: emptyChanges(),
      coDriverChanges: emptyChanges(),
      startData: { events, profile: { dailyLogSum, dailyLog } }
    };

    const body = JSON.stringify({
      CompanyId: rec.companyId,
      CompanyName: rec.companyName,
      PortalId: rec.portalId,
      PortalName: rec.portalName,
      CreateDate: now,
      LastSyncDate: now,
      Status: inProc ? "In process" : "Not started",
      RangeDateBgn: bgnStr,
      RangeDateEnd: endStr,
      DriverId: rec.driverId,
      DriverName: rec.driverName,
      TotalChanges: 0,
      ChangedDays: "",
      TransactionHistory: JSON.stringify(hist),
      TaskId: rec.taskId,
      CreateTask: true,
      TaskSource: rec.source || "",
      VehicleId: rec.vehicleId || "",
      VehicleName: rec.vehicleName || "",
      Grade: rec.grade != null && rec.grade !== "" ? (Number(rec.grade) || 0) : 0,
      LastChangeTime: now,
      Tasks: rawTypes.join(";")
    });

    const r = await fetch(API_BASE + "/api/FlowDashBoard/InsertTransactions", {
      method: "POST",
      headers: { Authorization: "Bearer " + authToken(), "Content-Type": "application/json" },
      body
    });
    if (!r.ok) {
      let t = "";
      try { t = (await r.text()).slice(0, 200); } catch (e) {}
      return { ok: false, status: r.status, error: "HTTP " + r.status + (t ? " — " + t : ""), events: events.length };
    }
    // Ответ: {"TransactionId":"<guid>"} — по нему открываем страницу транзакции,
    // как это делает платформа после подтверждения диалога.
    let transactionId = "";
    try { transactionId = ((await r.json()) || {}).TransactionId || ""; } catch (e) {}
    return {
      ok: true, status: r.status, events: events.length, transactionId,
      externalUrl: externalPortalUrl(rec, msg.externalPortals)
    };
  }

  // Прогреваем кеш компаний заранее, чтобы на захвате не платить за 3 МБ,
  // следом — токены и водителей по свежим компаниям реестра.
  setTimeout(() => {
    loadCompanyMap()
      .then(() => startBackgroundPrewarm(15, 4000))
      .catch(() => {});
  }, 4000);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__fct !== true) return;

    // Точечный прогрев: content.js зовёт его, как только задача прошла фильтр
    // приоритетов, — к моменту захвата запросы уже в пути.
    if (msg.kind === "turbo-prewarm") {
      try { prewarmCompany(reg().get(String(msg.taskId))); } catch (e) {}
      return;
    }

    if (msg.kind === "turbo-grab") {
      turboGrab(msg)
        .then((res) => {
          window.postMessage(Object.assign({ __fct: true, kind: "turbo-res", reqId: msg.reqId }, res), "*");
        })
        .catch((err) => {
          window.postMessage({
            __fct: true, kind: "turbo-res", reqId: msg.reqId,
            ok: false, error: String((err && err.message) || err).slice(0, 200)
          }, "*");
        });
      return;
    }

    if (msg.kind !== "turbo-req") return;

    if (msg.sig) {
      let rec = null;
      let size = 0;
      try {
        size = reg().size;
        if (msg.taskId) rec = reg().get(String(msg.taskId)) || null;
        // Пустая сигнатура (id-путь без DOM-строки) не даёт lookupBySig ничего
        // осмысленного сравнивать — пропускаем фаззи-фолбэк, чтобы не подставить
        // случайную первую запись реестра вместо "не найдено".
        if (!rec && (msg.sig.c || msg.sig.d || msg.sig.tk)) rec = lookupBySig(msg.sig);
      } catch (e) {}
      window.postMessage({ __fct: true, kind: "turbo-res", reqId: msg.reqId, found: !!rec, rec, regSize: size }, "*");
      return;
    }

    const opts = msg.options || {};
    // credentials намеренно не задаём — см. комментарий у apiGet: куки на
    // кросс-доменный API дают мгновенный 504.
    const init = { method: opts.method || "POST" };
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
