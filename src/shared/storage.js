globalThis.FCT = globalThis.FCT || {};

FCT.STORAGE_KEYS = {
  cfg: "cfg",
  logs: "logs",
  stats: "stats",
  // Глобальный стоп-кран захвата. Пишет его service worker, читают все вкладки:
  // storage.onChanged доходит туда, куда может не дойти sendMessage.
  capture: "captureOn"
};

FCT.SEED_VERSION = 2;

FCT.SEED_TYPES = [
  { type: "pti", enabled: true },
  { type: "break", enabled: true },
  { type: "new shift", enabled: true },
  { type: "new shift pti", enabled: true }
];

FCT.DEFAULT_CFG = {
  enabled: false,
  dryRun: true,
  unknownPolicy: "skip",
  activeTabOnly: false,
  soundOnGrab: true,
  logOnlyImportant: false,
  humanDelayMinMs: 0,
  humanDelayMaxMs: 40,
  seedVersion: 0,
  priorities: [],
  portals: { eld88: true, flow: true }
};

FCT.MAX_LOGS = 50;

FCT.loadCfg = async function () {
  const data = await chrome.storage.local.get(FCT.STORAGE_KEYS.cfg);
  const stored = data[FCT.STORAGE_KEYS.cfg] || {};
  const cfg = Object.assign({}, FCT.DEFAULT_CFG, stored);
  cfg.enabled = false;
  if (!Array.isArray(cfg.priorities)) cfg.priorities = [];
  const pdef = FCT.DEFAULT_CFG.portals;
  if (!cfg.portals || typeof cfg.portals !== "object") {
    cfg.portals = Object.assign({}, pdef);
  } else {
    if (typeof cfg.portals.eld88 !== "boolean") cfg.portals.eld88 = pdef.eld88;
    if (typeof cfg.portals.flow !== "boolean") cfg.portals.flow = pdef.flow;
  }
  if ((cfg.seedVersion || 0) < FCT.SEED_VERSION) {
    cfg.priorities = FCT.SEED_TYPES.map(s => ({ type: s.type, enabled: !!s.enabled }));
    cfg.seedVersion = FCT.SEED_VERSION;
    try { await FCT.saveCfg(cfg); } catch (e) {}
  }
  return cfg;
};

FCT.saveCfg = async function (cfg) {
  await chrome.storage.local.set({ [FCT.STORAGE_KEYS.cfg]: cfg });
};

FCT.patchCfg = async function (partial) {
  const cfg = await FCT.loadCfg();
  const next = Object.assign({}, cfg, partial);
  await FCT.saveCfg(next);
  return next;
};

// Счётчики захватов. Держим отдельно от журнала: тот обрезается до 50 строк,
// а статистика должна пережить обрезку. Сбрасывается на новый день.
FCT.todayKey = function () {
  const d = new Date();
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
};

FCT.loadStats = async function () {
  const data = await chrome.storage.local.get(FCT.STORAGE_KEYS.stats);
  const s = data[FCT.STORAGE_KEYS.stats];
  const day = FCT.todayKey();
  if (!s || s.day !== day) return { day, total: 0, sumMs: 0, lastAt: 0 };
  return s;
};

FCT.recordGrab = async function (info) {
  const s = await FCT.loadStats();
  s.total += 1;
  if (info && info.ms > 0) s.sumMs += info.ms;
  s.lastAt = Date.now();
  await chrome.storage.local.set({ [FCT.STORAGE_KEYS.stats]: s });
  return s;
};

FCT.appendLog = async function (entry) {
  const data = await chrome.storage.local.get(FCT.STORAGE_KEYS.logs);
  const logs = Array.isArray(data[FCT.STORAGE_KEYS.logs]) ? data[FCT.STORAGE_KEYS.logs] : [];
  logs.unshift(Object.assign({ ts: Date.now() }, entry));
  if (logs.length > FCT.MAX_LOGS) logs.length = FCT.MAX_LOGS;
  await chrome.storage.local.set({ [FCT.STORAGE_KEYS.logs]: logs });
};
