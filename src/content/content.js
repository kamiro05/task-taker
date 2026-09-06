(function () {
  if (window.__fctContentInstalled) return;
  window.__fctContentInstalled = true;

  const C = FCT.CONFIG;
  const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);

  const state = { cfg: Object.assign({}, FCT.DEFAULT_CFG) };

  let liveEnabled = false;

  const liveCfg = {
    get enabled() { return liveEnabled; },
    get priorities() { return state.cfg.priorities; },
    get unknownPolicy() { return state.cfg.unknownPolicy; }
  };

  function log(entry) {
    FCT.appendLog(Object.assign({ tab: TAB_ID }, entry)).catch(() => {});
  }

  function norm(t) { return FCT.normalizeType(t); }

  function hashString(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return "h" + (h >>> 0).toString(36);
  }

  function cellText(row, selector) {
    const el = row && row.querySelector(selector);
    return el ? norm(el.innerText || el.textContent || "") : "";
  }

  function isVisibleEl(el) {
    return !!(el && el.isConnected && el.getClientRects().length > 0);
  }

  function queryRows(root) {
    try {
      return [...(root || document).querySelectorAll(C.dom.rowSelector)];
    } catch (e) {
      return [];
    }
  }

  function extractTypes(row) {
    const out = [];
    const seen = new Set();
    const push = (raw) => {
      const r = String(raw == null ? "" : raw).trim();
      if (!r) return;
      const n = norm(r);
      if (!n || seen.has(n)) return;
      seen.add(n);
      out.push(r);
    };
    let cell = null;
    try { cell = row.querySelector(C.dom.taskCellSelector); } catch (e) {}
    if (cell) {
      const raw = cell.getAttribute(C.dom.typeAttrName);
      if (raw) {
        for (const part of raw.split(";")) push(part);
      }
    }
    if (out.length === 0) {
      let chips;
      try { chips = row.querySelectorAll(C.dom.typeChipSelector); } catch (e) { chips = []; }
      for (const chip of chips) {
        if (/(\s|^)more(\s|$)/.test(chip.className || "")) continue;
        push(chip.textContent);
      }
    }
    return out;
  }

  function extractId(row) {
    const basis = [
      cellText(row, C.dom.createDateSelector),
      cellText(row, C.dom.companySelector),
      cellText(row, C.dom.driverSelector)
    ].join("|");
    return hashString(basis || (row.textContent || "").slice(0, 400));
  }

  function extractStatus(row) {
    const el = row.querySelector(C.dom.statusTextSelector);
    return el ? norm(el.textContent) : cellText(row, ".mat-column-Status");
  }

  function isUnassigned(row) {
    const exec = cellText(row, C.dom.executorSelector);
    if (exec) return false;
    const st = extractStatus(row);
    if (C.dom.unassignedStatusRe.test(st)) return true;
    return st === "";
  }

  function taskFromRow(row) {
    const types = extractTypes(row);
    return {
      id: extractId(row),
      type: FCT.typeKey(types),
      allTypes: types.map(t => norm(t)),
      rawTypes: types,
      row
    };
  }

  function acquireLock(taskId) {
    const key = C.lockPrefix + taskId;
    const now = Date.now();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const rec = JSON.parse(raw);
        if (rec && rec.tab !== TAB_ID && now - rec.ts < C.lockTtlMs) return false;
      }
      localStorage.setItem(key, JSON.stringify({ tab: TAB_ID, ts: now }));
      setTimeout(() => { try { localStorage.removeItem(key); } catch (e) {} }, C.lockTtlMs * 2);
      return true;
    } catch (e) {
      return true;
    }
  }

  function dispatchClick(btn) {
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    try {
      const r = btn.getBoundingClientRect();
      if (r) {
        opts.clientX = Math.round(r.left + r.width / 2);
        opts.clientY = Math.round(r.top + r.height / 2);
        opts.screenX = opts.clientX;
        opts.screenY = opts.clientY;
      }
    } catch (e) {}
    try { btn.scrollIntoView({ block: "center", behavior: "instant" }); } catch (e) {}
    try { btn.focus({ preventScroll: true }); } catch (e) {}
    btn.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 1, isPrimary: true }, opts)));
    btn.dispatchEvent(new MouseEvent("mousedown", opts));
    btn.dispatchEvent(new PointerEvent("pointerup", Object.assign({ pointerId: 1, isPrimary: true }, opts)));
    btn.dispatchEvent(new MouseEvent("mouseup", opts));
    btn.click();
  }

  let timerWorker = null;
  let timerSeq = 0;
  function getTimerWorker() {
    if (timerWorker !== null) return timerWorker;
    try {
      const src = "const t=new Map();onmessage=e=>{const d=e.data;" +
        "if(d.cmd==='set'){const h=setTimeout(()=>{postMessage(d.id);t.delete(d.id);},d.ms);t.set(d.id,h);}" +
        "else if(d.cmd==='clear'){clearTimeout(t.get(d.id));t.delete(d.id);}};";
      timerWorker = new Worker(URL.createObjectURL(new Blob([src], { type: "application/javascript" })));
    } catch (e) { timerWorker = false; }
    return timerWorker;
  }

  function sleepV(ms) {
    return new Promise(resolve => {
      const w = getTimerWorker();
      if (!w) { setTimeout(resolve, ms); return; }
      const id = ++timerSeq;
      const onMsg = e => { if (e.data !== id) return; w.removeEventListener("message", onMsg); resolve(); };
      w.addEventListener("message", onMsg);
      w.postMessage({ cmd: "set", id, ms });
    });
  }

  FCT.schedule = (fn, ms) => {
    const w = getTimerWorker();
    if (!w) return setTimeout(fn, ms);
    const id = ++timerSeq;
    const onMsg = e => { if (e.data !== id) return; w.removeEventListener("message", onMsg); fn(); };
    w.addEventListener("message", onMsg);
    w.postMessage({ cmd: "set", id, ms });
    return id;
  };

  FCT.cancelSchedule = id => {
    const w = timerWorker;
    if (w) w.postMessage({ cmd: "clear", id });
    try { clearTimeout(id); } catch (e) {}
  };

  function randInt(min, max) {
    if (!(max >= min)) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  async function waitForTaken(row, taskId) {
    const deadline = Date.now() + C.confirmTimeoutMs;
    while (Date.now() < deadline) {
      if (!row.isConnected) return "row-gone";
      const exec = cellText(row, C.dom.executorSelector);
      if (exec) return "taken";
      const st = extractStatus(row);
      if (!C.dom.unassignedStatusRe.test(st)) return st ? "status-changed" : "";
      await sleepV(C.confirmPollMs);
    }
    return "";
  }

  // Последний InsertTransactions, замеченный inject.js в ЭТОЙ вкладке. Служит
  // доказательством авторства захвата: уход строки из «Not started» сам по себе
  // ничего не доказывает — её мог забрать другой оператор.
  let lastInsert = null;

  async function insertSucceededSince(sinceTs) {
    // Строка в таблице может обновиться чуть раньше, чем до нас дойдёт
    // postMessage об ответе сервера, поэтому даём короткую отсрочку.
    const deadline = Date.now() + 2500;
    for (;;) {
      if (lastInsert && lastInsert.ts >= sinceTs) return !!lastInsert.ok;
      if (Date.now() >= deadline) return false;
      await sleepV(150);
    }
  }

  function watchForErrorText() {
    return new Promise((resolve) => {
      const found = () => {
        for (const sel of C.errorIndicators.containerSelectors) {
          let nodes;
          try { nodes = document.querySelectorAll(sel); } catch (e) { continue; }
          for (const n of nodes) {
            if (!isVisibleEl(n)) continue;
            const txt = n.textContent || "";
            if (C.errorIndicators.textPatterns.some(re => re.test(txt))) return true;
          }
        }
        return false;
      };
      if (found()) return resolve(true);
      const mo = new MutationObserver(() => { if (found()) { mo.disconnect(); resolve(true); } });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { mo.disconnect(); resolve(false); }, C.errorWatchMs);
    });
  }

  // Момент, когда задача попала в очередь — от него считаем время захвата.
  const detectedAt = new Map();

  // Короткий сигнал при захвате: оператор может смотреть в другую вкладку.
  // Web Audio выбран намеренно — не требует разрешения "notifications",
  // которое пришлось бы обосновывать при публикации в Chrome Web Store.
  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
      osc.onended = () => { try { ctx.close(); } catch (e) {} };
    } catch (e) {}
  }

  // Итог захвата: счётчики для попапа + звук. Время меряем от постановки
  // в очередь до подтверждённого взятия.
  function onGrabbed(key) {
    const started = detectedAt.get(String(key));
    detectedAt.delete(String(key));
    const ms = started ? Date.now() - started : 0;
    try { chrome.runtime.sendMessage({ type: "fct-grab-ok" }).catch(() => {}); } catch (e) {}
    FCT.recordGrab({ ms }).catch(() => {});
    if (state.cfg.soundOnGrab !== false) beep();
  }

  const grabInFlight = new Set();

  function visibleDialogs(titleRe, selector) {
    let nodes;
    try { nodes = document.querySelectorAll(selector); } catch (e) { return []; }
    const out = [];
    for (const n of nodes) {
      if (n.isConnected && isVisibleEl(n) && titleRe.test(n.textContent || "")) out.push(n);
    }
    return out;
  }

  async function trustedClickAt(el) {
    let r = null;
    try { r = el.getBoundingClientRect(); } catch (e) {}
    if (!r || r.width <= 0 || r.height <= 0) return { ok: false, error: "нет координат" };
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    return await new Promise((resolve) => {
      let settled = false;
      const fin = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        chrome.runtime.sendMessage({ type: "fct-trusted-click", x, y }, (res) => {
          fin(res && res.ok ? { ok: true } : { ok: false, error: (res && res.error) || "нет ответа SW" });
        });
      } catch (e) { fin({ ok: false, error: "SW: " + ((e && e.message) || e) }); }
      setTimeout(() => fin({ ok: false, error: "таймаут SW" }), 3000);
    });
  }

  async function autoConfirmTxnDialog() {
    const d = C.dialog || {};
    if (!d.containerSelector) return "диалог не найден";
    let titleRe;
    try { titleRe = new RegExp(d.titleRe || "create\\s+transaction", "i"); } catch (e) { return "диалог не найден"; }
    let confirmRe;
    try { confirmRe = new RegExp(d.confirmRe || "^\\s*(?:start\\s+transaction|save|create)\\s*$", "i"); } catch (e) { confirmRe = null; }
    const labels = Array.isArray(d.confirmLabels) ? d.confirmLabels : ["start transaction", "save", "create"];
    const normBtnText = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const confirmPrefix = normBtnText(d.confirmPrefix || "start transaction");
    const presetText = String(d.presetText || "Last 8").trim().toLowerCase();
    const sel = d.containerSelector + ", mat-dialog-container";
    let deadline = Date.now() + (d.waitMs || 12000);
    const maxClicks = d.confirmClicksMax || 3;
    const reclickAfterMs = d.reclickAfterMs || 2500;
    const submitWaitMs = d.submitWaitMs || 20000;
    const presetDone = new WeakSet();
    const dg = { seen: false, preset: "—", clicks: 0, trusted: false, loading: false };
    let inventoryLogged = false;
    let foundIters = 0;
    let activeTxSeen = false;

    const isDisabledEl = (b) => {
      if (b.disabled) return true;
      try { if (b.getAttribute("aria-disabled") === "true") return true; } catch (e) {}
      return /(^|\s)disabled(\s|$)/i.test(String(b.className || ""));
    };

    const btnTextOf = (b) => {
      const t = normBtnText(b.textContent);
      if (t) return t;
      try { return normBtnText(b.getAttribute("aria-label") || b.getAttribute("title") || ""); } catch (e) { return ""; }
    };

    const hasIconInside = (b) => {
      try { return !!b.querySelector("mat-icon, .material-icons, svg"); } catch (e) { return false; }
    };

    const isAriaHidden = (b) => {
      try { return !!b.closest('[aria-hidden="true"]'); } catch (e) { return false; }
    };

    const isBtnLike = (el) => {
      const tag = el.tagName.toLowerCase();
      return tag === "button" || tag === "a" || el.getAttribute("role") === "button";
    };

    // Платформа дописывает к надписи суффикс («Start transaction (Platform
    // ELD88)»), поэтому сравниваем по началу строки, а не на равенство.
    const isConfirmText = (t) => !!t && t.indexOf(confirmPrefix) === 0;

    const drillDown = (el) => {
      let cur = el;
      for (;;) {
        let next = null;
        const kids = cur.children || [];
        for (const k of kids) {
          if (isConfirmText(normBtnText(k.textContent))) { next = k; break; }
        }
        if (!next) return cur;
        cur = next;
      }
    };

    const matchConfirm = (el, strongOnly) => {
      if (isDisabledEl(el) || !isVisibleEl(el) || isAriaHidden(el)) return false;
      const t = btnTextOf(el);
      if (!t) return false;
      // Единственная ветка, доступная не-кнопкам: у платформы подтверждение —
      // это <div class="custom-button">, а не <button> (см. раздел 17 заметок).
      if (isConfirmText(t)) return true;
      if (!isBtnLike(el)) return false;
      if (t.indexOf(confirmPrefix) !== -1) return true;
      if (strongOnly) return false;
      if (hasIconInside(el)) return false;
      if (labels.indexOf(t) !== -1) return true;
      return confirmRe ? confirmRe.test(t) : false;
    };

    const findConfirmIn = (root) => {
      if (!root) return null;
      let nodes;
      try { nodes = root.querySelectorAll("button, [role='button'], a, div, span"); } catch (e) { return null; }
      for (const el of nodes) if (matchConfirm(el, false)) return drillDown(el);
      return null;
    };

    const findConfirmGlobal = () => {
      let nodes;
      try { nodes = document.querySelectorAll("button, [role='button'], a, div, span"); } catch (e) { return null; }
      for (const el of nodes) if (matchConfirm(el, true)) return drillDown(el);
      return null;
    };

    const resolveConfirm = (dlg) => findConfirmIn(dlg) || findConfirmGlobal();

    while (Date.now() < deadline) {
      const dlgs = visibleDialogs(titleRe, sel);
      const dlg = dlgs.length ? dlgs[dlgs.length - 1] : null;
      if (!dlg) {
        if (!activeTxSeen && visibleDialogs(/active\s+transaction/i, sel).length) activeTxSeen = true;
        await sleepV(80);
        continue;
      }
      dg.seen = true;
      foundIters++;
      if (foundIters === 1) deadline = Math.max(deadline, Date.now() + 8000);

      if (!presetDone.has(dlg)) {
        presetDone.add(dlg);
        let hit = false;
        let pnodes;
        try { pnodes = dlg.querySelectorAll("button, [role='button'], a"); } catch (e) { pnodes = []; }
        for (const b of pnodes) {
          if (isDisabledEl(b)) continue;
          if (normBtnText(b.textContent) === presetText) { dispatchClick(b); hit = true; break; }
        }
        dg.preset = hit ? "клик" : "не найден";
      }

      const btn = resolveConfirm(dlg);
      if (!btn) {
        if (!inventoryLogged && foundIters >= 12) {
          inventoryLogged = true;
          const names = [];
          try {
            for (const b of dlg.querySelectorAll("button, [role='button'], a, [class*='custom-button']")) {
              if (names.length >= 30) break;
              const t = btnTextOf(b);
              names.push((isDisabledEl(b) ? "[x]" : "") + (t ? '"' + t.slice(0, 30) + '"' : "<пусто>"));
            }
          } catch (e) {}
          log({ event: "info", detail: "диалог: кнопки [" + (names.join(" | ") || "нет") + "]; preset: " + dg.preset });
        }
        await sleepV(90);
        continue;
      }
      const btnText = btnTextOf(btn);

      let lastClickAt = Date.now();
      let submitDeadline = 0;
      dispatchClick(btn);
      dg.clicks++;
      log({ event: "info", detail: "диалог: клик «" + btnText + "» №" + dg.clicks });

      while (true) {
        await sleepV(100);
        if (!dlg.isConnected || visibleDialogs(titleRe, sel).indexOf(dlg) === -1) return "";
        const now = Date.now();
        const cb = resolveConfirm(dlg);

        if (cb && isDisabledEl(cb)) {
          dg.loading = true;
          if (!submitDeadline) {
            submitDeadline = now + submitWaitMs;
            log({ event: "info", detail: "диалог: кнопка в loading — платформа отправила запрос" });
          }
          if (now > submitDeadline) {
            return "запрос подтверждения не закрыл диалог за " + Math.round(submitWaitMs / 1000) + " с — смотри InsertTransactions в журнале";
          }
          continue;
        }

        if (!cb) {
          if (now - lastClickAt > 2000) break;
          continue;
        }

        if (dg.clicks < maxClicks && now - lastClickAt >= reclickAfterMs && now < deadline) {
          const tr = await trustedClickAt(cb);
          dg.clicks++;
          lastClickAt = Date.now();
          if (tr.ok) {
            dg.trusted = true;
            log({ event: "info", detail: "диалог: доверенный клик (debugger) №" + dg.clicks });
          } else {
            dispatchClick(cb);
            log({ event: "info", detail: "диалог: повторный клик №" + dg.clicks + " (" + tr.error + ")" });
          }
          continue;
        }

        if (now >= deadline) {
          return "кликов " + dg.clicks + (dg.trusted ? " (вкл. доверенный)" : "") + ", «" + btnText + "» не отреагировала (loading не наступил)";
        }
      }
    }

    if (!dg.seen) return activeTxSeen
      ? "задачу перехватили — открылось окно Active transaction"
      : "диалог не найден за " + (d.waitMs || 12000) + " мс";
    return visibleDialogs(titleRe, sel).length ? "кнопка подтверждения не найдена в диалоге" : "";
  }

  async function performGrab(task, info) {
    const key = String(task.id);
    if (grabInFlight.has(key)) return;
    grabInFlight.add(key);
    try {
      if (state.cfg.dryRun) {
        log({ event: "dry-run", id: key, type: task.type, via: info.via, prio: info.prio });
        return;
      }

      if (state.cfg.activeTabOnly && document.visibilityState !== "visible") {
        log({ event: "skip", id: key, type: task.type, detail: "вкладка неактивна (activeTabOnly)" });
        return;
      }

      if (!acquireLock(key)) {
        log({ event: "skip", id: key, type: task.type, detail: "другая вкладка уже берёт" });
        return;
      }

      const delay = randInt(state.cfg.humanDelayMinMs, state.cfg.humanDelayMaxMs);
      if (delay > 0) await sleepV(delay);

      const row = findRowById(key);

      if (!row || !isUnassigned(row)) {
        log({ event: "error", id: key, type: task.type, detail: "заявку уже забрали" });
        return;
      }

      if (!portalAllowed(portalOf(row))) {
        log({ event: "skip", id: key, type: task.type, detail: "портал выключен в настройках" });
        return;
      }

      const btn = findTakeButton(row);

      if (!btn) {
        log({ event: "error", id: key, type: task.type, detail: "кнопка захвата не найдена" });
        return;
      }

      const clickedAt = Date.now();
      dispatchClick(btn);

      const confirmP = autoConfirmTxnDialog();
      let outcome = await waitForTaken(row, key);
      let confirmDiag = "";
      if (!outcome) {
        confirmDiag = await confirmP;
        if (!confirmDiag) {
          outcome = await waitForTaken(row, key);
          if (!outcome) outcome = "dialog-closed";
        }
      }
      const hadError = outcome ? false : await watchForErrorText();

      if (outcome === "taken" || outcome === "status-changed" || outcome === "row-gone" || outcome === "dialog-closed") {
        // Строка ушла из «Not started» — но это мог сделать и другой оператор,
        // перехвативший заявку, пока мы подтверждали диалог. Сам по себе уход
        // строки успехом не является. Наше взятие подтверждается только тем,
        // что ИЗ ЭТОЙ вкладки ушёл InsertTransactions и сервер принял его
        // (inject.js видит это в MAIN-мире). Без такого признака захват чужой:
        // раньше он записывался как наш и попадал в счётчики.
        const ours = await insertSucceededSince(clickedAt);
        if (!ours) {
          log({
            event: "error", id: key, type: task.type,
            detail: "заявку перехватил другой оператор" +
              (lastInsert && lastInsert.ts >= clickedAt ? " (наш запрос: HTTP " + lastInsert.status + ")" : " (наш запрос не ушёл)")
          });
          return;
        }
        log({ event: "grab", id: key, type: task.type, via: info.via, prio: info.prio, outcome });
        onGrabbed(key);
        return;
      }

      log({
        event: "error",
        id: key,
        type: task.type,
        detail: hadError
          ? "платформа сообщила об ошибке"
          : "статус не изменился после клика" + (confirmDiag ? " (" + confirmDiag + ")" : "")
      });
    } finally {
      grabInFlight.delete(key);
    }
  }

  function tooltipText(el) {
    const id = el.getAttribute && el.getAttribute("aria-describedby");
    if (!id) return "";
    const t = document.getElementById(id);
    return t ? norm(t.textContent) : "";
  }

  function findTakeButton(row) {
    let txCell;
    try { txCell = row.querySelector(C.takeButton.transactionCellSelector); } catch (e) {}
    if (!txCell) return null;
    const buttons = [...txCell.querySelectorAll("button")];
    try {
      const iconBtn = txCell.querySelector(C.takeButton.iconButtonSelector);
      if (iconBtn && isVisibleEl(iconBtn)) return iconBtn;
    } catch (e) {}
    for (const b of buttons) {
      if (!isVisibleEl(b)) continue;
      if (/start\s*transaction/i.test(tooltipText(b))) return b;
    }
    try {
      const lastBtn = txCell.querySelector(C.takeButton.lastButtonSelector);
      if (lastBtn && isVisibleEl(lastBtn)) return lastBtn;
    } catch (e) {}
    try { return txCell.querySelector(C.takeButton.firstButtonSelector); } catch (e) {}
    return buttons[0] || null;
  }

  function findRowById(id) {
    for (const row of queryRows(document)) {
      if (String(extractId(row)) === String(id)) return row;
    }
    return null;
  }

  function ingest(task, meta) {
    const res = queue.submit(task, meta);
    if (res.action === "queued") {
      // Отсюда считаем время захвата — до подтверждённого взятия.
      detectedAt.set(String(task.id), Date.now());
    } else if (res.action === "skip" && res.reason !== "disabled") {
      log({ event: "skip", id: String(task.id), type: task.type, detail: res.reason });
    }
  }

  function portalOf(row) {
    return cellText(row, C.dom.portalSelector);
  }

  function portalAllowed(p) {
    const cfgP = (state.cfg && state.cfg.portals) || {};
    return p === "eld88" ? cfgP.eld88 !== false : cfgP.flow !== false;
  }

  function ingestFromDom(el) {
    if (!isUnassigned(el)) return;
    if (!portalAllowed(portalOf(el))) return;
    const task = taskFromRow(el);
    if (!task.id) return;
    ingest(task, { via: "dom", el });
  }

  const queue = FCT.EngineCore.createQueue(
    liveCfg,
    (task, info) => { performGrab(task, info); },
    () => {}
  );

  let rescanTimer = null;
  function scheduleRescan() {
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      for (const row of queryRows(document)) ingestFromDom(row);
    }, C.rescanDebounceMs);
  }

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        let rows = [];
        try {
          if (node.matches && node.matches(C.dom.rowSelector)) rows = [node];
          else rows = [...node.querySelectorAll(C.dom.rowSelector)];
        } catch (e) {}
        for (const r of rows) ingestFromDom(r);
      }
    }
    scheduleRescan();
  });

  function startObserver() {
    const rootEl = document.documentElement || document;
    mo.observe(rootEl, { childList: true, subtree: true });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.__fct !== true) return;
    if (msg.kind === "insert-observed") {
      lastInsert = { ts: Date.now(), ok: !!msg.ok, status: msg.status };
      log({
        event: msg.ok ? "info" : "error",
        detail: "платформа InsertTransactions → HTTP " + msg.status + (msg.ok ? " (успех)" : " — сервер отклонил/таймаут")
      });
    }
  });

  FCT.loadCfg().then(cfg => {
    state.cfg = cfg;
    startObserver();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady);
    } else {
      onReady();
    }
  }).catch(err => {
    log({ event: "error", detail: "ошибка инициализации: " + ((err && err.message) || err) });
  });

  let lastErrLog = 0;
  window.addEventListener("error", (e) => {
    const now = Date.now();
    if (now - lastErrLog < 1000) return;
    lastErrLog = now;
    log({ event: "error", detail: "JS: " + (e.message || "unknown") });
  }, true);

  // Бейдж рисует service worker, а liveEnabled живёт здесь и обнуляется вместе
  // со страницей. Сообщаем своё состояние сами: при загрузке (выключено) и при
  // каждом переключении — иначе бейдж застревает на ON у выключённого захвата.
  function reportTabState() {
    try { chrome.runtime.sendMessage({ type: "fct-tab-state", enabled: liveEnabled }).catch(() => {}); } catch (e) {}
  }

  function onReady() {
    try {
      const isTasksPage = /task/i.test(location.pathname) || !!document.querySelector("table.tasks-table");
      if (isTasksPage) {
        log({ event: "info", detail: "движок загружен на странице задач" });
      }
    } catch (e) {}
    reportTabState();
    scheduleRescan();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FCT.STORAGE_KEYS.cfg]) return;
    const next = Object.assign({}, FCT.DEFAULT_CFG, changes[FCT.STORAGE_KEYS.cfg].newValue);
    if (!next.portals || typeof next.portals !== "object") next.portals = { eld88: true, flow: true };
    state.cfg = next;
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "fct-set-enabled") {
      liveEnabled = !!msg.value;
      reportTabState();
      log({ event: "info", detail: liveEnabled ? "захват ВКЛЮЧЁН" : "захват выключен" });
      try { sendResponse({ ok: true, enabled: liveEnabled }); } catch (e) {}
    } else if (msg.type === "fct-get-state") {
      try {
        sendResponse({ ok: true, enabled: liveEnabled, dryRun: !!state.cfg.dryRun });
      } catch (e) {}
    }
  });

  try { window.__fctConfirm = autoConfirmTxnDialog; } catch (e) {}
})();
