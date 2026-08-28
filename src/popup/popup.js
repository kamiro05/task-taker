(function () {
  const $ = (id) => document.getElementById(id);
  let cfg = null;

  const toggleIds = ["dryRun", "activeTabOnly", "soundOnGrab", "logOnlyImportant"];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function init() {
    cfg = await FCT.loadCfg();
    for (const id of toggleIds) $(id).checked = !!cfg[id];
    $("portalEld88").checked = !!(cfg.portals && cfg.portals.eld88 !== false);
    $("portalFlow").checked = !!(cfg.portals && cfg.portals.flow !== false);
    $("enabled").checked = false;
    $("unknownPolicy").value = cfg.unknownPolicy || "skip";
    $("delayMin").value = cfg.humanDelayMinMs;
    $("delayMax").value = cfg.humanDelayMaxMs;
    renderPriorities();
    renderModeHint();
    await renderStats();
    await renderLog();
    await syncEnabledFromTab();
    renderStatus();
  }

  // Крупный статус, чтобы боевой режим нельзя было проглядеть: раньше его
  // приходилось собирать глазами из трёх отдельных тумблеров.
  function renderStatus() {
    const on = $("enabled").checked;
    const dry = $("dryRun").checked;
    const badge = $("statusBadge");
    const card = $("statusCard");
    const hint = $("statusHint");
    card.classList.remove("live", "dry", "off");
    if (!on) {
      badge.textContent = "ВЫКЛ";
      card.classList.add("off");
      hint.textContent = "захват не работает";
    } else if (dry) {
      badge.textContent = "DRY RUN";
      card.classList.add("dry");
      hint.textContent = "только журнал, заявки не берутся";
    } else {
      badge.textContent = "БОЕВОЙ";
      card.classList.add("live");
      hint.textContent = "заявки берутся по-настоящему";
    }
  }

  function fmtMs(ms) {
    if (!ms) return "—";
    return ms < 1000 ? Math.round(ms) + " мс" : (ms / 1000).toFixed(1) + " с";
  }

  async function renderStats() {
    const s = await FCT.loadStats();
    $("statTotal").textContent = String(s.total || 0);
    $("statTurbo").textContent = s.total ? Math.round((s.turbo / s.total) * 100) + "%" : "—";
    $("statAvg").textContent = s.total ? fmtMs(Math.round(s.sumMs / s.total)) : "—";
    $("statLast").textContent = s.lastAt ? fmtTs(s.lastAt) : "—";
  }

  async function syncEnabledFromTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = (tab && tab.url) || "";
      if (!url.includes("alpha.flowconnect-group.com") || !tab.id) return;
      const res = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { type: "fct-get-state" }).catch(() => null),
        wait(700)
      ]);
      if (res && res.ok) $("enabled").checked = !!res.enabled;
    } catch (e) {}
  }

  // Бейдж SW не трогаем: о состоянии ему сообщают сами вкладки (fct-tab-state),
  // иначе после перезагрузки страницы бейдж расходится с реальностью.
  async function broadcastEnabled(value) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: "https://alpha.flowconnect-group.com/*" }); } catch (e) {}
    for (const t of tabs) {
      if (!t.id) continue;
      try { await chrome.tabs.sendMessage(t.id, { type: "fct-set-enabled", value }); } catch (e) {}
    }
  }

  async function save() {
    await FCT.saveCfg(cfg);
  }

  function renderPriorities() {
    const ul = $("priorityList");
    ul.textContent = "";
    const list = Array.isArray(cfg.priorities) ? cfg.priorities : [];
    list.forEach((item, i) => {
      const li = document.createElement("li");
      if (!item.enabled) li.className = "off";

      const pos = document.createElement("span");
      pos.className = "pos";
      pos.textContent = i + 1;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!item.enabled;
      cb.title = "Включён";
      cb.addEventListener("change", async () => {
        item.enabled = cb.checked;
        li.classList.toggle("off", !cb.checked);
        await save();
      });

      const name = document.createElement("span");
      name.className = "tname";
      name.title = item.type;
      name.textContent = item.type;

      const up = document.createElement("button");
      up.textContent = "↑";
      up.title = "Выше приоритетом";
      up.disabled = i === 0;
      up.addEventListener("click", () => move(i, -1));

      const down = document.createElement("button");
      down.textContent = "↓";
      down.title = "Ниже приоритетом";
      down.disabled = i === list.length - 1;
      down.addEventListener("click", () => move(i, 1));

      const del = document.createElement("button");
      del.textContent = "✕";
      del.className = "del";
      del.title = "Удалить из списка";
      del.addEventListener("click", async () => {
        cfg.priorities.splice(i, 1);
        await save();
        renderPriorities();
      });

      li.append(pos, cb, name, up, down, del);
      ul.appendChild(li);
    });
  }

  function renderModeHint() {
    const ready = !!(FCT.CONFIG.turbo && FCT.CONFIG.turbo.urlTemplate);
    $("modeHint").textContent = ready
      ? "Захват: Turbo (прямой запрос) с автопереходом на клик, если Turbo не сработал"
      : "Захват: клик по кнопке (Turbo ещё не настроен)";
  }

  async function move(i, dir) {
    const j = i + dir;
    const arr = cfg.priorities;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await save();
    renderPriorities();
  }

  async function addType(raw) {
    const t = FCT.normalizeType(raw);
    if (!t) return;
    if (cfg.priorities.some(p => FCT.normalizeType(p.type) === t)) return;
    cfg.priorities.push({ type: t, enabled: true });
    await save();
    renderPriorities();
  }

  function fmtTs(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function fmtEntry(e) {
    const parts = [];
    parts.push(e.event || "?");
    if (e.type) parts.push(`[${e.type}]`);
    if (e.id != null && e.event !== "info") parts.push("#" + e.id);
    if (e.detail) parts.push(e.detail);
    if (e.via) parts.push("(" + e.via + ")");
    return parts.join(" ");
  }

  async function renderLog() {
    const data = await chrome.storage.local.get(FCT.STORAGE_KEYS.logs);
    const logs = Array.isArray(data[FCT.STORAGE_KEYS.logs]) ? data[FCT.STORAGE_KEYS.logs] : [];
    const ul = $("logList");
    ul.textContent = "";
    // Штатные skip'ы (не тот тип) — 90% строк; под фильтром остаётся то,
    // ради чего в журнал вообще заглядывают.
    const shown = $("logOnlyImportant").checked
      ? logs.filter(e => e.event === "grab" || e.event === "error")
      : logs;
    if (!shown.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "пусто";
      ul.appendChild(li);
      return;
    }
    for (const e of shown.slice(0, 30)) {
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = fmtTs(e.ts);
      const ev = document.createElement("span");
      ev.className = "ev " + (e.event === "dry-run" ? "dry-run" : e.event || "");
      ev.textContent = e.event || "?";
      const d = document.createElement("span");
      d.className = "d";
      d.title = fmtEntry(e);
      d.textContent = fmtEntry(e);
      li.append(t, ev, d);
      ul.appendChild(li);
    }
  }

  for (const id of toggleIds) {
    $(id).addEventListener("change", async (e) => {
      cfg[id] = e.target.checked;
      await save();
      if (id === "dryRun") renderStatus();
      if (id === "logOnlyImportant") await renderLog();
    });
  }

  $("enabled").addEventListener("change", async (e) => {
    await broadcastEnabled(!!e.target.checked);
    renderStatus();
  });

  $("portalEld88").addEventListener("change", async (e) => {
    cfg.portals = Object.assign({}, cfg.portals || {}, { eld88: !!e.target.checked });
    await save();
  });

  $("portalFlow").addEventListener("change", async (e) => {
    cfg.portals = Object.assign({}, cfg.portals || {}, { flow: !!e.target.checked });
    await save();
  });

  $("unknownPolicy").addEventListener("change", async (e) => {
    cfg.unknownPolicy = e.target.value;
    await save();
  });

  function readDelay(which) {
    const v = Math.max(0, Math.min(5000, parseInt($(which).value, 10) || 0));
    return v;
  }

  $("delayMin").addEventListener("change", async () => {
    cfg.humanDelayMinMs = readDelay("delayMin");
    if (cfg.humanDelayMaxMs < cfg.humanDelayMinMs) {
      cfg.humanDelayMaxMs = cfg.humanDelayMinMs;
      $("delayMax").value = cfg.humanDelayMaxMs;
    }
    await save();
  });

  $("delayMax").addEventListener("change", async () => {
    let v = readDelay("delayMax");
    if (v < cfg.humanDelayMinMs) v = cfg.humanDelayMinMs;
    cfg.humanDelayMaxMs = v;
    $("delayMax").value = v;
    await save();
  });

  $("addTypeBtn").addEventListener("click", async () => {
    await addType($("newType").value);
    $("newType").value = "";
  });

  $("newType").addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await addType($("newType").value);
      $("newType").value = "";
    }
  });

  $("clearLogBtn").addEventListener("click", async () => {
    await chrome.storage.local.set({ [FCT.STORAGE_KEYS.logs]: [] });
    renderLog();
  });

  const INJECT_FILES = [
    "src/shared/platform-config.js",
    "src/shared/engine-core.js",
    "src/shared/storage.js",
    "src/shared/turbo.js",
    "src/content/content.js"
  ];
  const INJECT_MAIN = ["src/injected/inject.js"];

  function setStatus(text, cls) {
    const el = $("reinjectStatus");
    el.textContent = text;
    el.className = "reinject-status" + (cls ? " " + cls : "");
  }

  $("reinjectBtn").addEventListener("click", async () => {
    try {
      setStatus("подключаю…");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) { setStatus("вкладка не найдена", "err"); return; }
      const url = tab.url || "";
      if (!url.includes("alpha.flowconnect-group.com")) {
        setStatus("это не вкладка платформы", "err");
        return;
      }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_FILES });
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: INJECT_MAIN, world: "MAIN" });
      } catch (e) {}
      setStatus("движок подключён — проверьте журнал", "ok");
      await broadcastEnabled($("enabled").checked);
      setTimeout(renderLog, 600);
    } catch (e) {
      setStatus("ошибка: " + ((e && e.message) || e), "err");
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[FCT.STORAGE_KEYS.logs]) renderLog();
    if (changes[FCT.STORAGE_KEYS.stats]) renderStats();
  });

  init();
})();
