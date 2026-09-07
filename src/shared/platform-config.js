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
    // Надпись на кнопке подтверждения. Сравнивается по НАЧАЛУ строки, потому
    // что платформа дописывает к ней суффикс: для eld88 кнопка называется
    // «Start transaction (Platform ELD88)». Раньше сравнивали точно — после
    // переименования кнопка перестала находиться и диалог зависал.
    // Если платформа снова сменит надпись, правится только эта строка.
    confirmPrefix: "start transaction",
    // Кнопка отмены — ею закрываем диалог, если заявку успел забрать другой
    // оператор: иначе окно остаётся висеть у пользователя на экране.
    cancelText: "cancel",
    confirmRe: "^\\s*(?:start\\s+transaction|save|create)\\s*$",
    confirmLabels: ["start transaction", "save", "create"],
    waitMs: 12000,
    confirmClicksMax: 3,
    reclickAfterMs: 2500,
    submitWaitMs: 20000
  },

  batchWindowMs: 25,
  confirmTimeoutMs: 8000,
  confirmPollMs: 200,
  errorWatchMs: 3000,
  rescanDebounceMs: 150,

  dom: {
    // Сама таблица. Отдельно от rowSelector: пустая таблица — норма, а вот
    // исчезнувшая таблица на странице задач означает, что платформа сменила
    // разметку и захват молча перестал работать.
    tableSelector: "table.tasks-table",
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
