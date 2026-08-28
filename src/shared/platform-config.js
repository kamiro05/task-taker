globalThis.FCT = globalThis.FCT || {};

FCT.CONFIG = {
  origin: "https://alpha.flowconnect-group.com",

  channel: "__fct_bridge__",

  lockPrefix: "__fct_lock_",
  lockTtlMs: 3000,

  dialog: {
    containerSelector: ".cdk-overlay-container mat-dialog-container",
    titleRe: "create\\s+transaction",
    presetText: "Last 8",
    confirmRe: "^\\s*(?:start\\s+transaction|save|create)\\s*$",
    confirmLabels: ["start transaction", "save", "create"],
    waitMs: 12000,
    confirmClicksMax: 3,
    reclickAfterMs: 2500,
    submitWaitMs: 20000
  },

  turbo: {
    method: "POST",
    urlTemplate: "https://api.flowconnect-group.com/api/FlowDashBoard/InsertTransactions",
    portalsInProcess: ["eld88", "gpstab", "fmeld", "prologs_stop", "synergy_stop"],
    timeoutMs: 6000,
    // Захват = подготовительная цепочка (компания/водитель/HOS-журнал) + POST.
    grabTimeoutMs: 25000,
    // false — не прикладывать HOS-журнал: минус три запроса (~1 с на захвате).
    // Проверено вживую: сервер такую транзакцию ПРИНИМАЕТ (HTTP 200), страница
    // открывается нормально — логи платформа подтягивает с провайдера заново.
    // НО startData — это снимок «как было до правок»: в интерфейсе транзакции
    // есть переключатель startData/endData (toggleTime в бандле), и с пустым
    // startData сравнение до/после теряется. Ради секунды не стоит.
    includeStartData: true,
    // Для этих порталов платформа после захвата открывает ещё и внешний сайт
    // провайдера. Ключ — portalName из задачи, значение — шаблон ссылки.
    // {company}/{driver} подставляются как UUID (см. shortIdToUuid в inject.js).
    externalPortals: {
      eld88: "https://portal.eld88.us/co/{company}/compliance/logs/{driver}"
    }
  },

  batchWindowMs: 25,
  confirmTimeoutMs: 8000,
  confirmPollMs: 200,
  errorWatchMs: 3000,
  rescanDebounceMs: 150,

  dom: {
    rowSelector: "table.tasks-table tbody tr.mat-mdc-row",
    taskCellSelector: ".mat-column-Task [data-tasks]",
    typeChipSelector: ".mat-column-Task .task-chip",
    typeAttrName: "data-tasks",
    createDateSelector: ".mat-column-Create-Date",
    portalSelector: ".mat-column-Portal",
    companySelector: ".mat-column-Company",
    driverSelector: ".mat-column-Driver---CoDriver",
    executorSelector: ".mat-column-Executor",
    statusTextSelector: ".mat-column-Status .status-text",
    unassignedStatusRe: /not started/i
  },

  takeButton: {
    transactionCellSelector: ".mat-column-Transaction",
    iconButtonSelector: ".icon-btn",
    firstButtonSelector: ".actions-wrapper button:first-child",
    lastButtonSelector: ".actions-wrapper button:last-child"
  },

  ws: {
    idKeys: ["taskId", "task_id", "id", "_id", "uuid", "guid", "loadId", "orderId"],
    typeKeys: ["taskType", "task_type", "type", "kind", "category", "serviceType", "name"],
    eventKeys: ["event", "type", "action", "messageType", "op"],
    payloadKeys: ["data", "payload", "result", "task", "body", "params"],
    taskEventRe: /task|load|order|job/i,
    createdRe: /new|creat|add|open|assign|publish|appear|incoming/i,
    maxDepth: 4
  },

  errorIndicators: {
    containerSelectors: ['[role="alert"]', '[class*="toast"]', '[class*="snack"]', '[class*="notification"]', '[class*="alert"]'],
    textPatterns: [
      /уже\s*(был\w*)?\s*(занят|взят)/i,
      /already\s*taken/i,
      /no\s*longer\s*available/i,
      /недоступн/i,
      /не\s*удалось/i,
      /ошибк/i,
      /error/i,
      /failed/i
    ]
  }
};

FCT.normalizeType = function (t) {
  return String(t == null ? "" : t).toLowerCase().replace(/\s+/g, " ").trim();
};

FCT.typeKey = function (types) {
  const norm = FCT.normalizeType;
  const arr = (Array.isArray(types) ? types : [types])
    .map(norm)
    .filter(t => t && !/^\+\d+$/.test(t));
  return Array.from(new Set(arr)).sort().join(" ");
};

FCT.typeFromAny = function (v) {
  if (Array.isArray(v)) return FCT.typeKey(v);
  return FCT.typeKey(String(v == null ? "" : v).split(/[;,]/));
};
