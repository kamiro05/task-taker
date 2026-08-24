globalThis.FCT = globalThis.FCT || {};

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
        window.postMessage(Object.assign({ __fct: true, kind: "turbo-req", reqId }, req), "*");
      } catch (e) {
        clearTimeout(timer);
        pending.delete(reqId);
        resolve({ ok: false, error: "нет моста в страницу" });
      }
    });
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "/" + pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()); }

  function splitName(full) {
    const parts = String(full || "").trim().split(/\s+/);
    return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
  }

  function nameFromPrefixId(s) {
    const m = String(s == null ? "" : s).match(/^(?:company|user):\s*(.+)$/i);
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  }

  function buildCompany(rec, now) {
    if (rec.companyRaw && typeof rec.companyRaw === "object") return rec.companyRaw;
    const cid = rec.companyId || "";
    const portal = rec.portalName || "";
    return {
      a: true,
      id: cid,
      _id: cid,
      city: "",
      name: rec.companyName || nameFromPrefixId(cid),
      state: null,
      status: true,
      street: "",
      country: null,
      zipCode: "",
      original: null,
      timeZone: { id: "ET" },
      companyId: cid,
      dotNumber: "",
      terminals: [],
      mainOffice: { city: "", state: null, street: "", country: null, zipCode: "", fullAddress: null },
      departament: "",
      portal,
      portalId: rec.portalId || "",
      portalEmail: "",
      provider: String(portal).toUpperCase(),
      countDriver: 0,
      countDriverDriving: 0,
      countDriverViolations: 0,
      countViolations: 0,
      violationTime: 0,
      lastCheck: Math.floor(now / 1000),
      lastCheckFormatted: ""
    };
  }

  function buildMainDriver(rec) {
    if (rec.driverRaw && typeof rec.driverRaw === "object") return rec.driverRaw;
    const nm = splitName(rec.driverName || nameFromPrefixId(rec.driverId));
    return {
      _id: rec.driverId || "",
      companyId: rec.companyId || "",
      firstName: nm.firstName,
      lastName: nm.lastName,
      email: "",
      phoneNum: "",
      role: { id: "DRIVER" },
      driverInfo: { licenseNumber: "", licenseState: null, providerSettings: null },
      active: true,
      original: null
    };
  }

  function buildPayload(rec, task, cfg) {
    const now = Date.now();
    const portal = FCT.normalizeType(rec.portalName);
    const inProc = (cfg.portalsInProcess || []).some(p => FCT.normalizeType(p) === portal);
    let rawTypes = ((task && task.rawTypes) || [])
      .map(s => String(s).trim())
      .filter(s => s && !/^\+\d+$/.test(s));
    if (!rawTypes.length && rec.tasksStr) {
      rawTypes = rec.tasksStr.split(";").map(s => s.trim()).filter(Boolean);
    }

    const hist = {
      otherEvents: [],
      company: buildCompany(rec, now),
      driversInfo: { mainDriver: buildMainDriver(rec) },
      changes: { changesCount: 0, steps: [], changedEvents: [], createdEvents: [], deletedEvents: [] },
      startData: { events: [], profile: { dailyLogSum: [], dailyLog: [] } }
    };

    return JSON.stringify({
      CompanyId: rec.companyId,
      CompanyName: rec.companyName,
      PortalId: rec.portalId,
      PortalName: rec.portalName,
      CreateDate: now,
      LastSyncDate: now,
      Status: inProc ? "In process" : "Not started",
      RangeDateBgn: ymd(new Date(now - 8 * 86400000)),
      RangeDateEnd: ymd(new Date(now)),
      DriverId: rec.driverId,
      DriverName: rec.driverName,
      TotalChanges: 0,
      ChangedDays: "",
      TransactionHistory: JSON.stringify(hist),
      TaskId: rec.taskId,
      CreateTask: false,
      TaskSource: rec.source || "",
      VehicleId: rec.vehicleId || "",
      VehicleName: rec.vehicleName || "",
      Grade: rec.grade != null && rec.grade !== "" ? (Number(rec.grade) || 0) : 0,
      LastPickup: rec.lastPickupStr || "null",
      LastChangeTime: now,
      Tasks: rawTypes.join(";")
    });
  }

  async function grab(row, task, sig) {
    const t = spec();
    if (!isAvailable()) return { ok: false, error: "не настроен" };
    const q = await requestViaPage({ sig: sig || {} }, t.timeoutMs);
    if (!q.found || !q.rec) return { ok: false, error: "задача не найдена в реестре (" + (q.regSize || 0) + " зап.)" };
    const body = buildPayload(q.rec, task, t);
    const res = await requestViaPage({
      url: t.urlTemplate,
      options: { method: t.method || "POST", headers: { "Content-Type": "application/json" }, body }
    }, t.timeoutMs);
    if (!res.ok) return { ok: false, error: res.error || ("HTTP " + res.status), status: res.status };
    return { ok: true, status: res.status };
  }

  return { isAvailable, grab, buildPayload };
})();
