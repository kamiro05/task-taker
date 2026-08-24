# FlowConnect — заметки инспекции (Фаза 0)

> Инспекция проведена 2026-08-23 через Playwright MCP, аккаунт Amir (Team Leader),
> `https://alpha.flowconnect-group.com/tasks`, версия фронтенда 2.242.

## 1. Транспорт новых заявок

- **SSE (Server-Sent Events), НЕ WebSocket.**
- Эндпоинт: `GET https://sse.zigzagplus.com/api/sse/tasks?token=<JWT>`
  - JWT в query-параметре, issuer `authServer`, aud `resourceServer`, exp ~1 год.
- REST API: `https://api.flowconnect-group.com/api/…`
  - `POST /api/auth/loginUser`
  - `POST /api/FlowDashBoard/TasksHistory` — первичная загрузка таблицы
  - `GET  /api/FlowDashboard/SavedFilters?Module=Task`
  - `GET  /api/FlowDashBoard/States`, `/api/FlowManage/Portals`, `/api/FlowManage/SettingsUser`
- Живые обновления: SSE → Angular перерисовывает строки таблицы (проверено: новые строки
  появляются без запросов к TasksHistory). Задержка DOM ≈ задержка SSE + рендер.
- Вывод для расширения: основной механизм — MutationObserver на таблице (мгновенно);
  хук EventSource в inject.js добавлен как бонус/раннее оповещение.

## 2. DOM таблицы задач (`/tasks`)

- Фреймворк: Angular + Angular Material. Компонент таблицы: `table.tasks-table.mat-mdc-table`.
- Строка: `tr.mat-mdc-row` (+ класс приоритета `low-priority | medium-priority | high-priority`).
- Колонки (`td.mat-column-*`): Priority, Operator, Source, Portal, Company,
  Driver---CoDriver, CoDriver-Type, **Task**, Comment, Last-Pickup, Executor,
  Create-Date, Duration, Call-Driver, Status, Transaction, actions.
- **Тип задачи**: внутри `.mat-column-Task` чипы `<span class="task-chip" data-tasks="New shift">`.
  Тип(ы) читаются из атрибута `data-tasks` (может быть несколько чипов: «New shift»+«PTI»+«+1»).
- Приоритет: буква M/L/H? (видены M и L) в кружке; класс на tr.
- Исполнитель: текст `.mat-column-Executor`; у незанятых пусто.
- Статус: `.mat-column-Status .status-text` → «Not started» / «In process» / «Completed».
- Стабильного id у tr нет → дедуп по хешу (CreateDate|Company|Driver).

## 3. Незанятая заявка и кнопка захвата

- Незанятая = Executor пуст + статус «Not started». В Transaction-колонке две кнопки,
  ОБЕ с тултипом **«Start Transaction»** (подтверждено 5 живыми образцами):
  1. `button.status-btn` — пустая цветная (rgb(232,239,243));
  2. `button.icon-btn` c `img[src="assets/svg/reassign.svg"]`.
- У занятых строк тултип первой кнопки меняется на «Transaction: In Process» / «View Transaction».
- Конкуренция реальна: образцы забирают за 30–90 секунд.
- Клик-цель расширения: кнопка с тултипом `/start transaction/i` внутри
  `.mat-column-Transaction`; fallback — первая кнопка ячейки.

## 4. Подтверждение после клика

- Модал подтверждения не обнаружен (у незанятой строки клик сразу берёт задачу —
  требует живого теста). Успех детектится по изменению строки:
  Executor заполнился ИЛИ статус ушёл из «Not started».

## 5. Полный список task types (наблюдённые)

New shift; PTI; More hours (shift); More hours (driving); Add to Sleep; Add to Cycle;
Break; Monitoring; Change log online; Check the Logbook; Consulting; Audit; Fix log;
Profile; Switch; Restart; Violation (break); Violation (shift limit); Drove disc
(0 to 100mi); Drove disc (100 to 300mi). Чипы комбинируются («New shift PTI», «PTIFix log»).

## 6. Анти-автоматизация и риски

- Cloudflare (cdn-cgi/rum) присутствует; видимых капч нет.
- Собственное расширение FlowConnect упоминается на лендинге — конфликтов в DOM не видно.
- Риск аккаунта при автоматизации принимает пользователь; Dry Run обязателен первым шагом.

## 7. Решения после инспекции

- [x] platform-config.js переведён на реальные селекторы (data-tasks, mat-column-*).
- [x] inject.js: добавлен хук EventSource (SSE).
- [x] content.js: только незанятые заявки (Executor пуст + Not started), успех по смене статуса.
- [ ] Живое подтверждение клика по первой кнопке Transaction (Dry Run → один реальный клик).
- [ ] Turbo-режим — каркас готов, ждёт образец payload от ручного клика (зонд стоит).

## 8. API-карта (из бандлов фронтенда, v2.242)

Базовый URL: `https://api.flowconnect-group.com/`. Авторизация: заголовок
`Authorization: Bearer <accessToken>`, токен лежит в `localStorage["auth"]`
(сервис: `getAuth() { headers: { Authorization: Bearer ${authService.accessToken} } }`).

Сервис транзакций (Angular-сервис из чанка 22669):

| Метод | Запрос | Назначение |
|---|---|---|
| insertTransaction(r) | `POST api/FlowDashBoard/InsertTransactions` | **захват задачи** (создание транзакции) — тело `r` строит компонент, нужен живой образец |
| upsertTask(r) | `POST api/FlowDashBoard/UpsertTasks` | создание/правка задачи |
| updateTransaction(r) | `POST api/FlowDashBoard/UpdateTransactions` | обновление транзакции (завершение и т.п.) |
| updateTask(r) | `POST api/FlowDashBoard/UpdateTasks` | обновление задачи |
| getTransaction(id) | `GET api/FlowDashBoard/Transaction/{id}` | транзакция с историей |
| getTransactionWithoutHistory(id) | `GET api/FlowDashBoard/TransactionWithoutHistory/{id}` | транзакция без истории |
| getTask(id) | `GET api/FlowDashBoard/Task/{id}` | задача по id |
| getTransactions(...) | `GET api/FlowDashBoard/Transactions?TransactionId=ALL&CompanyId=…&DriverId=…&Completed=…` | список транзакций |
| getTasksHistory(...) | `GET api/FlowDashBoard/TasksHistory?DateBgn=…&DateEnd=…&Page=…&LimitPage=…` | данные таблицы (в компоненте вызывается как POST с телом `{DateBgn, DateEnd, Page, LimitPage, Category, LastSyncDate, …}`) |

Ключевые факты для turbo:

- **В DOM строк нет реальных id задач** (только `_ngcontent-*`) — id есть только
  в ответе TasksHistory и в SSE. Поэтому turbo-захват из расширения делается через
  мост в MAIN-мир: запрос выполняет `window.fetch` страницы (куки/Origin как у приложения).
- Кнопка «Start Transaction» у незанятой строки → компонент вызывает
  `insertTransaction(payload)`; payload снимается зондом `window.__fctProbe`
  (хуки fetch/XHR установлены в Playwright-браузере).
- UI-константы бандла: `StartTransaction`, `TransactionInProcess`, `ViewTransaction` —
  тултипы/переводы, подтверждающие семантику кнопки.

## 9. Типы и комбо-матчинг (уточнение от пользователя)

- Задача может нести НЕСКОЛЬКО типов (чипы). Полный набор лежит в атрибуте
  `data-tasks` ячейки Task через `;`: `data-tasks="New shift;PTI;Change log online"`.
- Чип `+1` (класс `task-chip more`) — скрытые дополнительные типы; в DOM видны не все,
  но `data-tasks` ячейки содержит полный список — читать надо его, а не текст чипов.
- Правило захвата (пользователь): матчинг ТОЛЬКО точным набором типов.
  Каноничный ключ = нормализованные типы, отсортированные и склеенные пробелом:
  чипы [New shift, PTI] → ключ «new shift pti». «new shift pti break» не совпадёт
  ни с одним пунктом списка → skip (unknown-type).
- Пользовательский приоритетный список (сид v2): pti > break > new shift > new shift pti.

## 10. TasksHistory — форма элемента Histories[] (живой захват, v2.242)

`POST api/FlowDashBoard/TasksHistory` → `{Pages, CountRow, Histories:[…]}`, элемент:

```
TaskId (GUID), UserId/UserName/UserColor (оператор-создатель),
CompanyId ("Company:…"), CompanyName,
DriverId ("User:…"), DriverName, CoDriverId/Name/Type,
VehicleId (GUID), VehicleName, PortalId (GUID), PortalName,
CreateDate (СТРОКА ms), CompletedDate, LastSyncDate,
Tasks ("New shift"), Comment, LastPickup (JSON-строка), Grade ("0"),
Source ("Telegram"), Office, CallDriver, Priority ("Low"),
Status ("Not started"), StatusOrder, TransactionId, TransactionStatus,
ExecutorUserId, ExecutorUserName, TelegramLink, TelegramDriverUId, History
```

Всё, что нужно payload'у InsertTransactions (включая реальные VehicleId/VehicleName/
Grade/LastPickup/Source), есть в реестре из Histories — inject.js собирает записи
глубоким обходом ответа; turbo.js подставляет их в payload.

## 11. Turbo v0.3 — как работает

1. inject.js (MAIN world, с document_start): перехватывает ответы TasksHistory
   (XHR+fetch) и кадры WS/SSE → `window.__fctTaskReg` Map по TaskId.
2. content.js: при turbo-захвате шлёт сигнатуру строки {компания, водитель, дата-ms}
   через postMessage-мост; inject ищет запись в реестре (±3 мин по дате).
3. turbo.js: buildPayload() собирает тело по схеме prepareTransaction() из бандла;
   Status="In process" для порталов eld88/gpstab/fmeld/prologs_stop/synergy_stop,
   иначе "Not started"; RangeDates = сегодня-7 … сегодня (yyyy/MM/dd).
4. POST InsertTransactions выполняет window.fetch страницы (Bearer из localStorage["auth"]
   проставит сам Angular? НЕТ — токен добавляет перехватчик Angular; прямой fetch без
   заголовка Authorization вернёт 401 → поэтому мост добавляет Bearer сам).
   Ошибка любого шага → автоматический откат на DOM-клик в том же захвате.

Проверка сервером TransactionHistory не подтверждена: отправляется облегчённая история
(пустые events/dailyLog). Если платформа отклонит — увидим в журнале «turbo: HTTP …»
и сработает откат на клик; тогда вернуть TransactionHistory из шаблона реального тела.

## 12. Клик-путь v0.3.1 — диалог Create transaction

Кнопка «Start Transaction» у незанятой строки НЕ берёт задачу сразу: открывается
диалог (mat-dialog-container, заголовок «Create transaction») с пресетами
«Last 8 / Last 14 / Last 30 / Range» (каждый — обычная <button>, selectDays(N)) и
кнопкой подтверждения (Start Transaction/Save/Create). Статус строки меняется
только после подтверждения → прежний клик-путь всегда давал «статус не изменился».

v0.3.1: после dispatchClick запускается autoConfirmTxnDialog() — ждёт диалог,
жмёт пресет «Last 8» (config.dialog.presetText), затем кнопку по confirmRe;
после подтверждения ещё один проход waitForTaken. Диалога нет (или не открылся) —
быстрый выход без задержки. Селекторы/тексты в config.dialog.

Диагностика turbo-миссов: мост возвращает regSize реестра; журнал пишет
«turbo: задача не найдена в реестре (N зап.)». N=0 → TasksHistory ещё не приходил
(свежая вкладка/гонка с первым ответом); N>0 и промах → не совпала сигнатура
(компания/водитель/дата ±3 мин) — смотреть сигнатуру строки против Histories[].

## 13. Turbo v0.3.3 — фикс промахов реестра (живой кейс: «не найдена (100 зап.)»)

Причина: в Histories[] НЕТ полей CompanyName/DriverName — только префиксные ID
(`CompanyId: "Company: VS CARRIER INC"`, `DriverId: "User: Harindra Singh"`).
Харвестер сохранял пустые имена, lookupBySig строго сравнивал компанию → отбрасывал
все записи. Фиксы:
- inject.js: имена выводятся из ID срезанием префиксов company:/user:/driver:;
  createDate через toMs() (ms-эпоха, секунды ×1000, ISO-string); tasksKey —
  канонический ключ типов из Tasks (split ";", lower, без "+N", sort, join " ").
- lookupBySig: скоринг компания+4 / водитель+2 (в обе стороны contains) /
  типы+3 (сравнение слов обоих ключей как отсортированных мультимножеств — фразы
  сами содержат пробелы); окно даты ±3 мин, но при полном совпадении c+d+типы
  (score=9) дата игнорируется (страховка от сдвига часового пояса колонки
  Create Date относительно браузера).
- content.js rowSigOf: в сигнатуру добавлен tk = FCT.typeKey(extractTypes(row)).
- Для отладки экспортированы window.__fctTurboLookup / window.__fctHarvestText;
  тесты реестра в engine-test.js гоняют реальный путь harvest(JSON Histories)→lookup.


## 14. v0.3.5: turbo HTTP 504 + автоподтверждение диалога

**504 (TransactionHistory).** Захвачен реальный body InsertTransactions
(fct-insert-body.json, обрезан на 2000 байт, но форма видна): TransactionHistory —
JSON-СТРОКА с полным объектом company (a/id/_id/city/name/state{id}/status/street/
country/zipCode/original/timeZone{id:"ET"}/companyId/dotNumber/terminals[]/
mainOffice/departament/portal/portalId/portalEmail/provider=PORTAL UPPER/countDriver*/
lastCheck(сек)/lastCheckFormatted), driversInfo = ТОЛЬКО {mainDriver:{_id=префиксный
DriverId, companyId, firstName/lastName, email, phoneNum, role{id:"DRIVER"},
driverInfo{licenseNumber/licenseState/providerSettings}, active:true, original:null}},
changes{changesCount:0,…}, otherEvents[]. Прежний payload отдавал company={id,_id,name}
и mainDriver без role/driverInfo → сервер падал → 504 gateway timeout. buildPayload
теперь строит полный fallback-объект по шаблону (недостающие поля пустыми/null),
harvest-нутые companyRaw/driverRaw прокидываются как есть; RangeDateBgn = now−8д
(в захвате 08/15→08/23). Верхний уровень без изменений (+TaskId/Tasks/…).

**Диалог не подтверждался.** Причины: querySelector брал СТАРЕЙШИЙ
mat-dialog-container (под ним могло висеть застрявшее окно прошлой попытки), а ссылка
dlg протухала после ре-рендера Angular → клик никогда не попадал в «Start transaction»
(~11 с = waitMs 6 с + confirm 5 с впустую). Теперь autoConfirmTxnDialog каждую итерацию
пере-запрашивает ВСЕ контейнеры по titleRe+visible и берёт НОВЕЙШИЙ (последний в DOM);
preset «Last 8» кликается один раз на инстанс диалога (WeakSet); кнопка подтверждения
ищется по нормализованному тексту из dialog.confirmLabels
["start transaction","save","create"] (fallback — confirmRe); после клика до 900 мс
ждём закрытия, при живом диалоге — повтор клика до дедлайна waitMs. Возврат — строка-
диагностика: "" успех / «диалог не найден» / «кнопка подтверждения не найдена»,
пишется в журнал в detail провала фолбэка.

Тесты 22/22 PASS (новые: форма TransactionHistory по шаблону, passthrough raw),
node --check 8 файлов чисто, manifest → 0.3.5.
## 15. v0.3.6: доверенный клик по диалогу + наблюдение за InsertTransactions

Симптом: диалог «Create transaction» остаётся открытым, «Start transaction» не
срабатывает. Две возможные причины неразличимы снаружи: (а) синтетический клик
(isTrusted=false) игнорируется обработчиком Angular; (б) клик доходит, платформа
шлёт InsertTransactions, но сервер отвечает ошибкой/долго → диалог не закрывается.

Решения:
- **Доверенные клики (chrome.debugger).** SW получил fct-trusted-click:
  attach(tabId, "1.3") → Input.dispatchMouseEvent mouseMoved/mousePressed/
  mouseReleased по координатам центра кнопки → detach. Это НАСТОЯЩИЕ события
  ввода (isTrusted=true), неотличимые от ручного клика. manifest: permission
  "debugger" (появляется жёлтая плашка «в режиме отладки» — нормально, отваливается
  сразу после клика). Если DevTools открыт на вкладке (attach невозможен) — fallback
  на синтетику. Тактика: синтетический клик №1 сразу; если через 2.5 с кнопка не в
  loading и диалог жив → доверенный клик; до 3 кликов; waitMs=6 с.
- **Детекция «запрос ушёл».** Если после клика кнопка стала disabled (loading) —
  обработчик СРАБОТАЛ, платформа отправляет запрос; ждём закрытия до 20 с
  (dialog.submitWaitMs), в журнал: «кнопка в loading — платформа отправила запрос».
- **Наблюдение за InsertTransactions.** inject.js перехватывает fetch/XHR на
  /InsertTransactions/ и постит insert-observed {status}; content пишет в журнал
  «платформа InsertTransactions → HTTP NNN (успех|сервер отклонил/таймаут)».
  Теперь видно: клик не дошёл (нет loading, нет HTTP-строки) vs сервер отказал
  (loading был, HTTP 5xx).
- Синтетический dispatchClick теперь передаёт clientX/clientY (центр кнопки).
- Селектор диалога расширен: ".cdk-overlay-container mat-dialog-container,
  mat-dialog-container" (страховка от смены контейнера).
- Диагностика возврата autoConfirmTxnDialog (в detail провала): «диалог не найден
  за N мс» / «кнопка подтверждения не найдена в диалоге» / «кликов N (вкл.
  доверенный), «start transaction» не отреагировала (loading не наступил)» /
  «запрос подтверждения не закрыл диалог за 20 с».

Тесты 22/22 PASS, node --check 8 файлов, manifest → 0.3.6.
## 16. v0.3.7: кнопка подтверждения не находилась — расширение поиска

Журнал 21:46: «кнопка подтверждения не найдена в диалоге» — диалог найден, но за
6 с ни одного совпадения кнопки (нет строк «диалог: клик…»). Вывод: confirm-кнопка
не матчится по признакам «<button> + точный текст». Причины могли быть: не button
(a/[role=button]), текст в aria-label, aria-disabled/класс disabled, кнопка вне
mat-dialog-container. Фиксы:
- поиск по button, [role='button'], a; текст: textContent → aria-label → title;
- disabled: b.disabled || aria-disabled=true || класс /disabled/;
- сильный матч: текст содержит «start transaction» (и в диалоге, и ГЛОБАЛЬНО по
  документу — страховка от «кнопка вне контейнера»; глобально только сильный матч,
  чтобы не кликнуть mat-icon «create»=карандаш в строках таблицы);
- слабый матч (точный «save»/«create»/confirmRe) только внутри диалога и только для
  кнопок без mat-icon/svg внутри;
- ДИАГНОСТИКА: если за ~1.2 с кнопка не найдена, в журнал пишется дамп всех кнопок
  диалога: «диалог: кнопки ["cancel" | "last 8" | …]; preset: клик/не найден» — по
  нему сразу видно реальные тексты/состояния;
- preset сравнивается в нижнем регистре с нормализацией пробелов.
manifest → 0.3.7.
## 17. v0.3.8: КОРЕНЬ ПРОБЛЕМЫ — «Start transaction» это DIV, не button

Проверка на живом сайте (Playwright, реальный DOM): в диалоге «Create transaction»
кнопки «Start transaction» и «Cancel» — это НЕ <button>/<a>/[role=button], а
**<div class="mat-mdc-tooltip-trigger mat-ripple custom-button primary …">**
внутри mat-dialog-container. Поэтому ВСЕ прежние версии (поиск только по тегам
кнопок) физически не могли их найти → «кнопка подтверждения не найдена в диалоге».
Пресеты Last 8/14/30 — настоящие <button>, поэтому с ними проблем не было.

Фикс v0.3.8:
- поиск подтверждения по button, [role='button'], a, **div, span**;
- точный матч: нормализованный текст === "start transaction"; для button/a
  дополнительно подстрока и старые метки save/create (без mat-icon внутри);
- drillDown(): спуск к самому глубокому потомку с тем же текстом (клик по ребёнку
  всплывает до обработчика на custom-button);
- фильтр aria-hidden (исключает tooltip-сообщения cdk с тем же текстом);
- disabled: свойство/aria-disabled/класс — покрывает div;
- глобальный fallback (вне диалога) — только точный "start transaction".

Проверено на живом DOM: findConfirmIn находит
div.custom-button.primary «start transaction», close-детекция по удалению
mat-dialog-container работает (Cancel-div закрывает диалог).

Доп. находка: клик .icon-btn по строке «In process» открывает ДРУГОЙ диалог —
«Active transaction» (инфо, без кнопок). titleRe его не матчит → корректный
«диалог не найден» в журнале (значит задачу перехватили между детектом и кликом).
Также добавлен window.__fctConfirm (дёрнуть подтверждение из консоли вручную).
Тесты 22/22, manifest → 0.3.8.
## 18. v0.3.9: работа в фоновой вкладке + тайминги + перехват

Проблема: при уходе на другую вкладку задачи берутся (turbo по fetch не душится),
но диалоговая часть умирает: Chrome режет DOM-таймеры в фоне — первые 5 мин
минимум 1 с, дальше интенсивный режим до 1/мин. Детект (MutationObserver/WS) и
fetch живут, всё на setTimeout — нет. Замер в живом браузере: автоматизационный
Chrome без троттлинга (100 мс = 100 мс за 15 мин в фоне), обычный — по правилам выше.

Фиксы:
- worker-таймеры: getTimerWorker() создаёт Worker из Blob; sleepV(ms) и
  FCT.schedule/FCT.cancelSchedule идут через него (в фоне не душатся), fallback —
  setTimeout; sleep → sleepV в waitForTaken, циклах autoConfirm и human-delay;
- engine-core: очередь flush через FCT.schedule (25 мс батч больше не замирает);
- тайминги: dialog.waitMs 12000, confirmTimeoutMs 8000; при первом появлении
  диалога дедлайн продлевается на +8 с (футер рендерится после медленного API
  истории);
- dialog-closed: если диалог закрылся после нашего клика подтверждения, а статус
  ещё не обновился → grab с outcome dialog-closed, не ошибка;
- распознавание перехвата: если вместо «Create transaction» открылось
  «Active transaction» — диагностика «задачу перехватили», не «диалог не найден».

Известное: turbo «задача не найдена в реестре (100 зап.)» для свежих WS-задач —
норма (реестр = последняя выгрузка таблицы, лимит 100), фолбэк на клик.
Тесты 22/22 PASS, node --check 8/8, manifest → 0.3.9.

## 19. v0.4.0: ребрендинг Task Taker, Turbo по умолчанию, чистка UI

Ребрендинг «FlowConnect Task Sniper» → **«FlowConnect Task Taker»**: имя/описание
в manifest.json, заголовки README/попапа, глобальное пространство имён во всех
JS-файлах `FCS` → `FCT` (и производные: `__fcs*` → `__fct*`, сообщения
`fcs-*` → `fct-*`, `fcs-insert-body.json` → `fct-insert-body.json`). Механическая
замена по всем src-файлам, manifest, README, докам и тестовой странице; после
замены `node --check` по всем 8 JS-файлам — чисто, ручных ссылок на старое
имя не осталось (проверено grep'ом).

Функциональные изменения:
- **Turbo стал режимом по умолчанию, не настройкой.** Убран тумблер «Turbo» и
  поле `cfg.turbo` из конфига: `performGrab` в content.js теперь пробует
  `FCT.Turbo` всегда, когда он доступен (`isAvailable()`), без проверки
  пользовательской галочки. Клик по кнопке остаётся автоматическим бэкапом —
  логика отката (турбо ошибся/не нашёл заявку → клик) не менялась, просто
  теперь это единственный путь, а не опция.
- **Убрана функция «Догонять пропущенное».** Тумблер `catchUp` и связанный
  `state.cfg.catchUp` были фактически мертвы: `loadCfg()` всегда форсирует
  `cfg.enabled = false`, а `catchUpRescan()` проверял именно `state.cfg.enabled`
  (не связанный с реальным мастер-тумблером `liveEnabled`) — условие никогда не
  было истинным, рескан по фокусу/видимости вкладки не срабатывал ни разу.
  Слушатели `visibilitychange`/`focus` и функция `catchUpRescan` удалены.
  Безусловный скан существующих строк на старте (`onReady` → `scheduleRescan()`)
  оставлен — это база работы движка (ловит строки, отрисованные до подключения
  MutationObserver), а не опциональная функция.
- **Попап: UI собран заново.** Порталы ELD88/FLOW — теперь один ряд с двумя
  компактными chip-переключателями (`:has()`-стилизация, Chrome 111+ уже
  минимальная версия) вместо двух отдельных строк-свитчей. Тумблеры Turbo и
  «Догонять пропущенное» убраны из разметки; вместо статуса Turbo — плашка
  `#modeHint` с описанием текущего режима захвата (Turbo/клик). Обновлён
  popup.css: карточки секций на градиенте, лого в шапке, доработанные свитчи,
  цветная левая полоса у строк журнала по типу события (`:has()`).

`FCT.DEFAULT_CFG` больше не содержит `turbo`/`catchUp`. Сообщение
`fct-get-state` вместо поля `turbo` отдаёт `turboReady` (диагностика, не
настройка). node --check 8/8 чисто, manifest → 0.4.0.