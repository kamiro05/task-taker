(function () {
  const $ = (id) => document.getElementById(id);
  let cfg = null;

  const toggleIds = ["dryRun", "activeTabOnly", "soundOnGrab", "showPanel", "wordFilterEnabled", "logOnlyImportant"];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function init() {
    cfg = await FCT.loadCfg();
    for (const id of toggleIds) $(id).checked = !!cfg[id];
    $("portalEld88").checked = !!(cfg.portals && cfg.portals.eld88 !== false);
    $("portalFlow").checked = !!(cfg.portals && cfg.portals.flow !== false);
    $("enabled").checked = false;
    unknownPolicyDd.set(cfg.unknownPolicy || "skip");
    $("delayMin").value = cfg.humanDelayMinMs;
    $("delayMax").value = cfg.humanDelayMaxMs;
    renderPriorities();
    renderBlocked();
    renderWords();
    await renderShortcut();
    await renderStats();
    await renderHealth();
    await renderLog();
    await syncEnabledFromTab();
    renderStatus();
  }

  // Клавиши по умолчанию нет: Chrome требует в манифесте модификатор (Ctrl или
  // Alt) и отклоняет одиночную F-клавишу — расширение с ней просто не грузится.
  // Одиночные F-клавиши разрешены только при ручном назначении, поэтому ведём
  // пользователя на страницу горячих клавиш Chrome.
  async function renderShortcut() {
    let shortcut = "";
    try {
      const cmds = await chrome.commands.getAll();
      const c = cmds.find(x => x.name === "toggle-capture");
      shortcut = (c && c.shortcut) || "";
    } catch (e) {}
    $("shortcutBtn").textContent = shortcut || "назначить";
  }

  $("shortcutBtn").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

  // Диагноз ставят вкладки; попап только показывает последний.
  async function renderHealth() {
    const data = await chrome.storage.local.get(FCT.STORAGE_KEYS.health);
    const h = data[FCT.STORAGE_KEYS.health];
    const bad = !!(h && h.ok === false);
    $("healthBanner").hidden = !bad;
    if (bad) {
      $("healthText").textContent = (h.reason || "разметка платформы изменилась") +
        " — захват может не работать. Проверьте журнал ниже.";
    }
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
    $("statAvg").textContent = s.total ? fmtMs(Math.round(s.sumMs / s.total)) : "—";
    $("statLast").textContent = s.lastAt ? fmtTs(s.lastAt) : "—";
  }

  // Состояние спрашиваем у воркера: он знает про ВСЕ вкладки платформы. Раньше
  // опрашивалась только активная вкладка, и если попап открыт не на странице
  // задач — слайдер показывал «выключено» при работающем захвате.
  async function syncEnabledFromTab() {
    try {
      const res = await Promise.race([
        chrome.runtime.sendMessage({ type: "fct-enabled-state" }).catch(() => null),
        wait(700)
      ]);
      if (res && res.ok) $("enabled").checked = !!res.enabled;
    } catch (e) {}
  }

  // Рассылку делает воркер. Попап уничтожается сразу при закрытии и обрывает
  // свои незавершённые await — из-за этого выключение долетало не до всех
  // вкладок и захват продолжал работать при выключенном на вид слайдере.
  async function broadcastEnabled(value) {
    try { await chrome.runtime.sendMessage({ type: "fct-set-enabled-all", value }); } catch (e) {}
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

  // Чёрный список компаний: порядок не важен, поэтому без стрелок — только
  // название и кнопка удаления.
  function renderBlocked() {
    const ul = $("blockedList");
    ul.textContent = "";
    const list = Array.isArray(cfg.blockedCompanies) ? cfg.blockedCompanies : [];
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "empty-row";
      li.textContent = "список пуст — берутся все компании";
      ul.appendChild(li);
      return;
    }
    list.forEach((name, i) => {
      const li = document.createElement("li");

      const tname = document.createElement("span");
      tname.className = "tname";
      tname.title = name;
      tname.textContent = name;

      const del = document.createElement("button");
      del.textContent = "✕";
      del.className = "del";
      del.title = "Убрать из чёрного списка";
      del.addEventListener("click", async () => {
        cfg.blockedCompanies.splice(i, 1);
        await save();
        renderBlocked();
      });

      li.append(tname, del);
      ul.appendChild(li);
    });
  }

  // Стоп-слова живут отдельным списком: у них своя семантика совпадения (по
  // целому слову) и свой выключатель.
  function renderWords() {
    const ul = $("wordList");
    ul.textContent = "";
    const list = Array.isArray(cfg.blockedWords) ? cfg.blockedWords : [];
    if (!list.length) {
      const li = document.createElement("li");
      li.className = "empty-row";
      li.textContent = "список пуст — комментарии не проверяются";
      ul.appendChild(li);
      return;
    }
    list.forEach((word, i) => {
      const li = document.createElement("li");

      const tname = document.createElement("span");
      tname.className = "tname";
      tname.title = word;
      tname.textContent = word;

      const del = document.createElement("button");
      del.textContent = "✕";
      del.className = "del";
      del.title = "Убрать стоп-слово";
      del.addEventListener("click", async () => {
        cfg.blockedWords.splice(i, 1);
        await save();
        renderWords();
      });

      li.append(tname, del);
      ul.appendChild(li);
    });
  }

  async function addWord(raw) {
    const word = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!word) return;
    if (!Array.isArray(cfg.blockedWords)) cfg.blockedWords = [];
    const exists = cfg.blockedWords.some(w => FCT.normalizeType(w) === FCT.normalizeType(word));
    if (exists) return;
    cfg.blockedWords.push(word);
    await save();
    renderWords();
  }

  $("addWordBtn").addEventListener("click", async () => {
    await addWord($("newWord").value);
    $("newWord").value = "";
  });

  $("newWord").addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await addWord($("newWord").value);
      $("newWord").value = "";
    }
  });

  async function addCompany(raw) {
    const name = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!name) return;
    if (!Array.isArray(cfg.blockedCompanies)) cfg.blockedCompanies = [];
    const exists = cfg.blockedCompanies.some(c => FCT.normalizeType(c) === FCT.normalizeType(name));
    if (exists) return;
    cfg.blockedCompanies.push(name);
    await save();
    renderBlocked();
  }

  $("addCompanyBtn").addEventListener("click", async () => {
    await addCompany($("newCompany").value);
    $("newCompany").value = "";
  });

  $("newCompany").addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await addCompany($("newCompany").value);
      $("newCompany").value = "";
    }
  });

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

  // Своё выпадающее меню вместо <select>: системный список Chrome рисует
  // средствами ОС — светлым, своим шрифтом, мимо темы попапа. Работает как
  // <select> и с клавиатуры: Enter/Пробел/стрелки открывают, стрелки водят по
  // пунктам, Enter выбирает, Esc закрывает и возвращает фокус на кнопку.
  function initDropdown(id, onChange) {
    const root = $(id);
    const btn = root.querySelector(".dd-btn");
    const val = root.querySelector(".dd-val");
    const list = root.querySelector(".dd-list");
    const items = [...list.querySelectorAll("[role='option']")];
    let cursor = 0;

    const paint = () => {
      const v = root.dataset.value;
      items.forEach((li, i) => {
        const on = li.dataset.value === v;
        li.setAttribute("aria-selected", on ? "true" : "false");
        li.classList.toggle("active", i === cursor);
        if (on) val.textContent = li.textContent;
      });
    };

    const open = () => {
      cursor = Math.max(0, items.findIndex(li => li.dataset.value === root.dataset.value));
      list.hidden = false;
      root.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      paint();
    };

    const close = (focusBtn) => {
      list.hidden = true;
      root.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      if (focusBtn) btn.focus();
    };

    const pick = (li) => {
      root.dataset.value = li.dataset.value;
      paint();
      close(true);
      onChange(li.dataset.value);
    };

    btn.addEventListener("click", () => { list.hidden ? open() : close(false); });

    for (const li of items) {
      li.addEventListener("click", () => pick(li));
      li.addEventListener("mousemove", () => { cursor = items.indexOf(li); paint(); });
    }

    root.addEventListener("keydown", (e) => {
      if (list.hidden) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          open();
        }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); cursor = (cursor + 1) % items.length; paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cursor = (cursor - 1 + items.length) % items.length; paint(); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(items[cursor]); }
    });

    // Клик мимо меню закрывает его — как у нативного списка.
    document.addEventListener("click", (e) => {
      if (!list.hidden && !root.contains(e.target)) close(false);
    });

    return {
      set(v) { root.dataset.value = v; paint(); },
      get() { return root.dataset.value; }
    };
  }

  const unknownPolicyDd = initDropdown("unknownPolicy", async (v) => {
    cfg.unknownPolicy = v;
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
      // Адрес платформы держим в одном месте — в platform-config.js.
      if (!url.startsWith(FCT.CONFIG.origin)) {
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
    if (changes[FCT.STORAGE_KEYS.health]) renderHealth();
  });

  init();
})();
