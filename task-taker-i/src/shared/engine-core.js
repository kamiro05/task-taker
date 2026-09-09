globalThis.FCT = globalThis.FCT || {};

FCT.EngineCore = (function () {
  const FLUSH_MS = FCT.CONFIG ? FCT.CONFIG.batchWindowMs : 25;

  function keyOf(t) {
    if (FCT.typeKey) return FCT.typeKey(t);
    return (FCT.normalizeType || (x => String(x)))(t);
  }

  const norm = (s) => (FCT.normalizeType || (x => String(x)))(s);

  // ── Фильтры отказа ────────────────────────────────────────────────────────
  //
  // Два списка с РАЗНОЙ семантикой совпадения, и разница не косметическая.
  //
  // Компании — по вхождению подстроки: оператор пишет «rogue» и ловит
  // «ROGUE CARRIER INC», не помня точного написания из таблицы.
  //
  // Комментарии — по целому слову: это свободный текст, и подстрока «pu»
  // сработала бы внутри «pick up», а «ne» — внутри «need», «new» и «note».
  // Пробел внутри записи означает разделитель любой длины, поэтому «pick up»
  // находит и «pick  up» с переносом строки.

  const RE_SPECIAL = /[.*+?^${}()|[\]\\]/g;
  const BOUNDARY_L = "(?<![\\p{L}\\p{N}])";
  const BOUNDARY_R = "(?![\\p{L}\\p{N}])";

  function compileWord(entry) {
    const needle = norm(entry);
    if (!needle) return null;
    const body = needle.replace(RE_SPECIAL, "\\$&").replace(/ /g, "\\s+");
    try {
      return new RegExp(BOUNDARY_L + body + BOUNDARY_R, "u");
    } catch (e) {
      return null;
    }
  }

  // Обе функции возвращают сработавшую запись списка (а не true), чтобы её
  // было видно в журнале: «почему заявку не взяли» — первый вопрос оператора.
  function findBlockedWord(text, list) {
    if (!Array.isArray(list) || list.length === 0) return "";
    const hay = norm(text);
    if (!hay) return "";
    for (const raw of list) {
      const re = compileWord(raw);
      if (re && re.test(hay)) return raw;
    }
    return "";
  }

  function findBlockedCompany(text, list) {
    if (!Array.isArray(list) || list.length === 0) return "";
    const hay = norm(text);
    if (!hay) return "";
    for (const raw of list) {
      const needle = norm(raw);
      if (needle && hay.indexOf(needle) !== -1) return raw;
    }
    return "";
  }

  function priorityIndex(cfg, type) {
    const target = keyOf(type);
    const list = Array.isArray(cfg.priorities) ? cfg.priorities : [];
    for (let i = 0; i < list.length; i++) {
      if (!list[i].enabled) continue;
      const itemKey = keyOf(list[i].type);
      if (itemKey === target && itemKey !== "") return i;
    }
    return -1;
  }

  function createQueue(cfg, onGrab, onSkip) {
    let seqCounter = 0;
    const seen = new Set();
    const pending = [];
    let flushTimer = null;

    function flush() {
      flushTimer = null;
      if (pending.length === 0) return;
      // Захват могли выключить в окне между submit и flush — очередь
      // выбрасываем, иначе уже принятые задачи всё равно уходили в работу.
      if (!cfg.enabled) { pending.length = 0; return; }
      pending.sort((a, b) =>
        a.prio - b.prio || a.seq - b.seq
      );
      const batch = pending.splice(0, pending.length);
      for (const item of batch) {
        onGrab(item.task, { prio: item.prio, via: item.via });
      }
    }

    function submit(task, meta) {
      meta = meta || {};
      const id = task && task.id != null ? String(task.id) : null;
      if (!id) {
        if (onSkip) onSkip(task, "no-id", meta);
        return { action: "skip", reason: "no-id" };
      }

      if (!cfg.enabled) {
        if (onSkip) onSkip(task, "disabled", meta);
        return { action: "skip", reason: "disabled" };
      }

      if (seen.has(id)) {
        return { action: "dup" };
      }
      seen.add(id);

      const prio = priorityIndex(cfg, task.type);
      if (prio === -1) {
        const target = keyOf(task.type);
        const known = (cfg.priorities || []).some(p => keyOf(p.type) === target);
        if (!known && cfg.unknownPolicy === "grab") {
          enqueue(task, 1e9, meta);
          return { action: "queued" };
        }
        if (onSkip) onSkip(task, known ? "type-disabled" : "unknown-type", meta);
        return { action: "skip", reason: known ? "type-disabled" : "unknown-type" };
      }

      enqueue(task, prio, meta);
      return { action: "queued" };
    }

    function enqueue(task, prio, meta) {
      pending.push({ task, prio, seq: seqCounter++, via: (meta && meta.via) || "?" });
      if (!flushTimer) flushTimer = (typeof FCT.schedule === "function" ? FCT.schedule : setTimeout)(flush, FLUSH_MS);
    }

    function flushNow() {
      if (flushTimer) { (typeof FCT.cancelSchedule === "function" ? FCT.cancelSchedule : clearTimeout)(flushTimer); }
      flush();
    }

    return { submit, flushNow };
  }

  return { createQueue, priorityIndex, findBlockedWord, findBlockedCompany };
})();
