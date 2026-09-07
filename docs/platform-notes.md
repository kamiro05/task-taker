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

## 20. v0.4.1: КОРЕНЬ ПРОМАХОВ TURBO — SSE-хук слушал не то событие

Живая диагностика (Playwright, второе прямое подключение к SSE-эндпоинту через
`fetch()` + `ReadableStream`, в обход EventSource): сервер шлёт кадры
**именованными** событиями, не дефолтным `message`:

```
event: ping
data: {}

event: taskUpsert
data: {"TaskId":"...","CompanyId":"...","CompanyName":"...","DriverId":"...",
       "DriverName":"...","Tasks":"...","Status":"...","ExecutorUserId":"...", …}
```

`inject.js` навешивал слушатель только на `es.addEventListener("message", …)` —
для именованных событий (`event: taskUpsert`) браузер это НЕ считает `message` и
обработчик не срабатывает никогда. Итог, подтверждённый по журналу: за всю
предыдущую сессию 0 из 50+ записей пришли с `via: "sse/ws"` — 100% детекции шло
через MutationObserver (DOM). SSE-хук был полностью мёртв с момента написания
(Фаза 0), просто это маскировалось тем, что DOM-путь сам справлялся. Именно
поэтому Turbo стабильно получал «задача не найдена в реестре»: реестр
наполнялся только из разового `TasksHistory` при загрузке страницы и никогда не
обновлялся дальше — таск, появившийся после открытия вкладки, физически не мог
там оказаться.

**Важно**: задержку/повторный lookup перед фолбэком на клик не добавляли —
пользователь верно заметил, что это убивает саму идею Turbo (обогнать всех).
Вместо костыля исправили причину промаха.

Фикс:
- `inject.js`: `SSE_EVENT_NAMES = ["message", "taskUpsert"]`, `PatchedEventSource`
  вешает `decodeData` на каждое имя из списка — `taskUpsert` уже содержит
  ПОЛНЫЙ набор полей, нужных `harvest()` (TaskId/CompanyId/DriverId/…), в
  реестр попадает сразу, без опроса TasksHistory.
- Обнаружена вторым заходом связанная, тоже с рождения нерабочая проблема:
  «быстрый путь» (`extractFromObject` → `ws-task` postMessage → `via: sse/ws`
  в content.js) искал ключи `taskId`/`type` в нижнем регистре — платформа шлёт
  `TaskId`/`Tasks` (другой регистр И другое имя поля). `extractFromObject` был
  написан на Фазе 0 до того, как стала известна реальная форма API, и так и не
  обновился. Чинить универсальный сканер эвристиками не стали — вместо этого
  `harvest()` при первой регистрации новой задачи (`!m.has(tid)`), если
  `Status` соответствует «not started» и `ExecutorUserId` пуст, сам зовёт
  `post({id: tid, type: tasksStr})`, переиспользуя уже правильно распарсенные
  поля. Косвенный признак, что путь реально ожил при живой проверке: id записей
  в журнале — настоящий GUID платформы (`TaskId`), а не локальный
  `hashString()`-хеш, которым помечены DOM-детекты.

Живая проверка (Dry Run, мастер-тумблер включён точечно и сразу выключен после
каждого замера, подтверждено через `fct-get-state` при каждом переключении):
реестр Turbo вырос со 101 до 103 записей за 40 с (раньше не рос вообще, самая
свежая запись «старела» 1:1 с временем ожидания); отдельным прогоном — 11
записей в журнале с id в виде GUID платформы (сигнатура быстрого SSE-пути) за
40 с, все «unknown-type» (типы задач не входили в текущий приоритетный список,
поэтому дальше skip, не grab/dry-run).

**Инцидент при первой боевой проверке (до этого фикса).** При проверке
турбо/клика вживую (с разрешения пользователя, «забери одну реальную заявку»)
мастер-тумблер в попапе не отключился по первому клику — реально взято 4
задачи вместо одной, пока шло разбирательство. Причина клика не установлена
(похоже на гонку/устаревший ref в тестовом инструменте, не воспроизведена
намеренно), но обнаружен надёжный обходной путь: слать `fct-set-enabled`
напрямую через `chrome.tabs.sendMessage` на все вкладки из
`chrome.tabs.query({url: "…/*"})` и проверять `fct-get-state` сразу после —
так подтверждалось мгновенно и работало без сбоев во всех последующих
переключениях. Все 4 задачи ушли через клик-фолбэк (Turbo на тот момент ещё
не был починен), outcome «taken», без ошибок платформы.

node --check 8/8 чисто, manifest → 0.4.1.

## 21. v0.4.2: Turbo без DOM-строки + подтверждённый HTTP 504 — проблема сервера, не наша

**Почему SSE-детект не мог довести дело до захвата.** `performGrab` всегда
начинал с `findRowById(key)`, сравнивая `key` с хешем DOM-строки
(`hashString(createDate|company|driver)`). SSE-детект несёт настоящий
`TaskId` платформы (GUID) — структурно не может совпасть с локальным хешем,
поэтому строка никогда не находилась, и до Turbo/клика дело не доходило
вообще: только лишний лог «заявку уже забрали».

Фикс (content.js/turbo.js/inject.js):
- `ingest()` для `ws-task` теперь прокидывает `portal` из живого пуша
  (harvest уже знает `portalName` — добавлен в `post()`).
- `performGrab`: если `findRowById` не нашёл строку, но у задачи есть
  `task.portal` и Turbo доступен — портал-фильтр проверяется по
  `task.portal`, и вызывается `FCT.Turbo.grab(null, task, null)`
  («слепой» захват, без строки и без сигнатуры). Успех → `outcome:
  "turbo/no-row"`. Неудача → тихий выход; независимый DOM-детект той же
  заявки (свой hash-id) обработает её как обычно, вплоть до клика — это и
  есть страховка, отдельный код поиска строки по сигнатуре не понадобился.
- `turbo.js`: `grab()` теперь всегда передаёт `taskId` в `turbo-req`;
  `inject.js` сначала пробует точный `reg().get(taskId)` и только если не
  нашёл — фаззи `lookupBySig` (и только если сигнатура не пустая: с пустой
  `sig` фаззи-поиск может подставить случайную первую запись реестра вместо
  честного «не найдено» — заблокировано отдельной проверкой).
- `turbo.js`: тело неуспешного ответа (`res.body`, раньше отбрасывалось)
  теперь попадает в текст ошибки — на следующий HTTP-сбой сразу видно, что
  отвечает сервер, без отдельного теста.

**Живая проверка (3 захвата подряд, с разрешения пользователя, каждый раз
подтверждено выключение сразу после первого совпадения):**
1. break → Turbo нашёл в реестре → **HTTP 504** → откат на клик → taken.
2. new shift → Turbo нашёл в реестре → **HTTP 504** → откат на клик → taken.
3. new shift → сработали ОБА пути параллельно: слепой SSE-путь
   (`turbo (без DOM-строки): HTTP 504`) и обычный DOM-путь
   (`turbo: HTTP 504 — откат на клик`), с разницей 13 мс — оба получили 504
   на один и тот же InsertTransactions. DOM-путь дошёл до клика и успешно
   взял.

Вывод (ОШИБОЧНЫЙ, опровергнут в разделе 22): реестр Turbo и весь путь запроса
работают, а 504 — «нестабильность сервера», чинить нечего. На самом деле
сервер был исправен, а 504 вызывала наша же строка `credentials: "include"`.
Признак, который следовало заметить сразу: в том же прогоне через 4 секунды
после нашего 504 POST самой платформы на ТОТ ЖЕ эндпоинт вернул 200.

node --check 8/8 чисто, manifest → 0.4.2.

## 22. v0.5.0: КОРЕНЬ ВСЕХ 504 — `credentials: "include"`; полноценный payload

**Причина.** `inject.js` слал запросы с `credentials: "include"`. Фронтенд живёт
на `alpha.flowconnect-group.com`, API — на `api.flowconnect-group.com`, т.е.
запрос кросс-доменный, и с куками шлюз отвечает мгновенным 504. Angular шлёт
запросы без кук, авторизуется только заголовком `Bearer`.

Доказательство (один и тот же URL `/api/FlowDashBoard/States`, один токен,
одна страница, запросы подряд):

| запрос | результат |
|---|---|
| `credentials: 'include'` | 504 за 169 мс |
| без `credentials` | **200**, 4767 байт, 305 мс |
| `credentials: 'include'` | 504 за 117 мс |
| `credentials: 'omit'` | **200**, 4767 байт, 307 мс |

Мгновенный (~120 мс) 504 — сам по себе улика: настоящий Gateway Timeout занял
бы десятки секунд. Раньше это маскировалось тем, что `credentials` стоял ТОЛЬКО
в мосту turbo, поэтому «ломался» ровно turbo, а всё остальное работало.

**Заодно исправлена форма payload** (сверено с живым успешным POST платформы,
снятым через Playwright). Прежний `buildPayload` собирал «скелет»:
- `provider` выводился как ИМЯ ПОРТАЛА в верхнем регистре (`"ROYAL"`), хотя это
  отдельное поле компании и у того же портала оно `"HOS247"`;
- `company`/`mainDriver` — пустые заглушки (нет dotNumber, portalEmail,
  terminals, адреса, email/телефона/прав водителя);
- `startData` — пустые массивы вместо реального журнала (у платформы 247
  HOS-событий, 8–9 dailyLog и dailyLogSum; TransactionHistory 287 КБ против
  наших 1.1 КБ);
- лишний `LastPickup`, `CreateTask: false` вместо `true`, отсутствовал
  `coDriverChanges`.

**Как собирается теперь** (всё через собственный API FlowConnect, сторонний
`backend.apexhos.com` не нужен — у платформы есть прокси):

| данные | источник |
|---|---|
| company (28 полей) | `GET /api/FlowManage/Portals` → `Companies[]`, кеш 30 мин |
| токен провайдера | `GET /api/FlowManage/CompanyAccessToken` |
| mainDriver | `GET /api/FlowManage/PortalDrivers` → `Users[]`, кеш 5 мин |
| `startData.events` | `GET /api/FlowProvider/HosEvents` + `X-Provider-Token` |
| `profile.dailyLog` | `GET /api/FlowProvider/DailyLog` |
| `profile.dailyLogSum` | `GET /api/FlowProvider/DailyLogSummaries` |

Диапазоны сняты с живого запроса: `RangeDate*` = последние 8 дней (пресет
«Last 8»), HosEvents берётся на 3 дня шире назад, daily-логи — ровно по Range.
`X-Provider-Token` — обязательный заголовок для `FlowProvider/*` (без него
400 «Missing X-Provider-Token Header»), значение = ответ CompanyAccessToken.

**Архитектура.** Сборка payload перенесена из turbo.js (ISOLATED) в inject.js
(MAIN): данные весят сотни КБ, гонять их через postMessage-мост бессмысленно.
`turbo.js` остался тонким клиентом (resolve TaskId → `turbo-grab` → ответ).
Кеш компаний прогревается сам через 4 с после загрузки страницы, чтобы на
захвате не платить за 3 МБ.

**Дедупликация.** Одну заявку приносят два независимых пути: SSE-детект (id =
TaskId платформы) и DOM-детект (id = хеш строки). Их локи в content.js по
разным ключам друг друга не видят — с НЕРАБОЧИМ turbo это было незаметно (оба
падали), с рабочим создало бы ДВЕ транзакции на одну заявку. Единственная
точка, где оба сходятся с разрешённым TaskId — `turboGrab` в MAIN-мире: там
Set'ы `grabInFlight`/`grabDone`; при отказе-дубле возвращается `dedup: true`,
и content.js не откатывается на клик.

**Замеры (живая проверка сборки, без POST).** Portals 973–1069 мс (один раз,
кешируется); на захват: CompanyAccessToken 317 мс + параллельно
(PortalDrivers + HosEvents + DailyLog + DailyLogSummaries) 1080 мс = **~1.4 с**,
дальше POST. Клик-путь в логах занимал ~10 с от детекта до taken. Собранный
payload проверен на живых данных другой компании (TIMTRANS INC, портал redfox):
компания 28 полей, водитель найден, 247 событий, 9 dailyLog, 9 dailyLogSum,
TransactionHistory 280 КБ, набор ключей совпадает с настоящим.

node --check 8/8 чисто, manifest → 0.5.0.

## 23. v0.5.1: TURBO ПОДТВЕРЖДЁН ВЖИВУЮ + вкладка транзакции

**Первый в истории проекта успешный turbo-захват** (живой прогон, разрешение
пользователя, одна заявка): POST InsertTransactions вернул **HTTP 200** и тело
`{"TransactionId":"<guid>"}`. Фикс `credentials` из раздела 22 подтверждён на
проде — до него КАЖДАЯ попытка упиралась в 504.

Что вскрылось в первом прогоне и исправлено:

1. **Флаг дедупликации терялся по дороге.** `turbo.js.grab()` возвращал только
   `{ok, error, status}`, отбрасывая `dedup` из MAIN-мира. Из-за этого DOM-путь
   получал «turbo: захват уже идёт» как обычную ошибку и уходил в клик по уже
   взятой turbo задаче: платформа ответила **HTTP 400** трижды (обычный клик +
   два доверенных), диалог «Create transaction» остался висеть на экране.
2. **Схема дедупликации заменена на разделение результата.** Отбрасывать второй
   путь неверно: если turbo провалится, фолбэк на клик обязан отработать.
   Теперь `grabInFlight` — это `Map<taskId, Promise>`, и второй путь ДОЖИДАЕТСЯ
   результата первого (`shared: true`). Успех — оба считают задачу взятой и не
   кликают; провал — фолбэк на клик работает как раньше.
3. **Успешный turbo больше не откатывается на клик.** Раньше при `r.ok`, если
   `waitForTaken` не увидел смены статуса за 8 с, код писал «статус не изменился
   — откат на клик» и кликал. После 200 транзакция уже создана, строка просто
   могла не успеть перерисоваться — клик в этот момент и давал 400 + зависший
   диалог. Теперь `r.ok` = успех, outcome `turbo/<исход>` или `turbo/принят`.
4. **Вкладка транзакции.** Turbo берёт задачу без диалога, поэтому платформа
   сама страницу не открывает (при клик-пути открывала). Ответ POST содержит
   `TransactionId` — `inject.js` его парсит, `content.js` шлёт SW сообщение
   `fct-open-transaction`, SW делает `chrome.tabs.create({active: false})`.
   Фоном, чтобы захват следующих заявок не сбивался переключением вкладки.
   URL валидируется регуляркой на `alpha.flowconnect-group.com/transaction/`.
   При `shared: true` вкладка не открывается — её уже открыл первый путь.

**Контрольный прогон после правок (чистый):**

```
:54.295  захват ВКЛЮЧЁН
:58.389  grab [new shift] outcome: turbo/taken   ← 4.1 с от включения
:70.813  захват выключен
```

Ни одной ошибки в журнале; диалог не открывался; вкладка
`/transaction/a7638440-…` открылась; ровно один POST, дубля нет. Для сравнения:
клик-путь в прошлых прогонах занимал ~10 с от детекта до taken.

**Замечание по окружению (не код).** Chrome 137+ убрал поддержку
`--load-extension` в обычной сборке — с 152 расширение молча не грузится.
Тестовый конфиг Playwright переведён на `channel: "chromium"` (Chrome for
Testing), там флаг работает. Также в этом профиле кнопка «Перезагрузить» на
chrome://extensions выключает режим разработчика и вместе с ним расширение —
после каждой перезагрузки его надо включать обратно.

node --check 8/8 чисто, manifest → 0.5.1.

## 24. v0.6.0: предпрогрев, статистика, карточка состояния

**Скорость: предпрогрев компаний.** Замер подготовки показывал
CompanyAccessToken 317 мс + PortalDrivers 1356 мс — ~1.7 с из ~2 с не зависят
от самой задачи, только от компании. Теперь:
- кеши (`driversCache`, `tokenCache`) хранят ПРОМИСЫ, а не результаты: если
  прогрев уже начал запрос, захват подхватывает тот же промис вместо второго
  такого же обращения к API;
- TTL: водители 10 мин, токен 4 мин (JWT живёт недолго — берём запас);
- фоновый прогрев `startBackgroundPrewarm(15, 4000)` — по одной компании раз в
  4 с, максимум 15, стартует после загрузки Portals. Медленно и с потолком
  намеренно: API уже показывал заградительные ответы под нагрузкой;
- точечный прогрев: `content.js` зовёт `FCT.Turbo.prewarm(task)` в момент, когда
  задача принята очередью (`action === "queued"`), — запросы уходят, пока идут
  батч-окно и человеческая задержка;
- `getMainDriver` и `getProviderToken` теперь идут параллельно (раньше токен
  ждал своей очереди, хотя PortalDrivers его не требует) — ещё ~300 мс.

Живая проверка: за 40 с прогрето 10 компаний, Portals загружен один раз,
0 ошибок в консоли.

**Скорость: флаг `turbo.includeStartData`** (по умолчанию `true`). При `false`
транзакция уходит без HOS-журнала — минус три запроса (~1 с), но в истории
транзакции не будет снимка логов, который туда кладёт платформа. Гипотеза, что
сервер такое примет, НЕ проверена: раньше её нельзя было проверить, потому что
в payload мешался неверный `provider`. Проверяется одним боевым захватом.

**Статистика.** Отдельный ключ `stats` в storage (журнал обрезается до 50 строк,
счётчики должны это пережить), сбрасывается на новый день: `total`, `turbo`,
`click`, `sumMs`, `lastAt`. Пишется в `onGrabbed()`, время меряется от
постановки задачи в очередь до подтверждённого взятия.

**Попап.** Карточка состояния сверху: крупный badge `БОЕВОЙ` (красная рамка) /
`DRY RUN` / `ВЫКЛ` — раньше режим приходилось собирать глазами из трёх
тумблеров, и боевой режим легко было проглядеть. Рядом четыре счётчика: взято
за сегодня, доля Turbo, среднее время, время последнего захвата. Плюс фильтр
журнала «только захваты и ошибки» (штатные `skip unknown-type` — ~90% строк) и
тумблер звука.

**Звук при захвате** — Web Audio (короткий сигнал), намеренно не
`chrome.notifications`: то разрешение пришлось бы обосновывать при публикации
в Chrome Web Store.

node --check 8/8 чисто, manifest → 0.6.0.

## 25. v0.6.1: startData НУЖЕН (гипотеза закрыта), внешний портал eld88

**Гипотеза про пустой `startData` проверена боевым захватом — и отклонена.**

Что показал тест (`includeStartData: false`, одна реальная заявка):
- сервер такую транзакцию **принимает**: `HTTP 200`, `{"TransactionId":…}`;
- три provider-запроса не уходят вовсе (проверено по `performance`:
  0 вызовов HosEvents/DailyLog/DailyLogSummaries), захват = **один POST
  на 1157 мс**;
- страница транзакции открывается полностью рабочей — график, события, часы:
  логи платформа подтягивает с провайдера заново, наш снимок для отображения
  не используется.

Но в бандле нашлось, ЗАЧЕМ он платформе:

```js
toggleTime(){ this.displayTime = this.activeDisplayTime ? "endData" : "startData"; … }
// и подстановка startData как исходного состояния:
!TransactionHistory[displayTime]?.events?.length && TransactionHistory.startData?.events.length
  && (TransactionHistory[displayTime] = JSON.parse(JSON.stringify(TransactionHistory.startData)))
```

`startData` — снимок журнала «как было ДО правок», в интерфейсе транзакции есть
переключатель startData/endData. С пустым startData сравнение до/после теряется —
а это суть работы оператора. Флаг оставлен (`includeStartData`), но по умолчанию
`true`: секунда не стоит потери базы сравнения.

**Внешний портал eld88.** Платформа после захвата открывает не только страницу
транзакции, но и сайт провайдера. Из бандла (`eld88Handler`):

```js
window.open(`https://portal.eld88.us/co/${EW(fF(company._id))}/compliance/logs/${EW(fF(driverId))}`)
```

`fF` срезает префикс (`Company:75peTSLzIdSG…` → `75peTSLzIdSG…`), `EW`
разворачивает base62-shortId в UUID: разбор по алфавиту
`0-9A-Za-z` → 16 байт little-endian → перестановка первых трёх групп
(`E[3]E[2]E[1]E[0]-E[5]E[4]-E[7]E[6]-…`). Алгоритм перенесён в inject.js
(`shortIdToUuid`) и **сверен с эталоном**: `Company:75peTSLzIdSGvtvtWj2bNc` →
`49f6f44c-3343-4eb0-9b0b-3b5d91d816e9` — ровно тот UUID, что был в URL,
который платформа открыла сама при клик-захвате 24 августа.

Шаблон ссылки лежит в `platform-config.js` (`turbo.externalPortals`, ключ —
`portalName`), чтобы платформенные строки оставались в одном файле; inject.js
подставляет UUID и возвращает `externalUrl`, content.js передаёт её тому же
`fct-open-transaction`, SW открывает фоновой вкладкой. В SW allowlist добавлен
`portal.eld88.us/co/`. Для не-eld88 порталов ссылка не строится (пустая строка).
Рядом в бандле есть `gpstabHandler` (`app.gpstab.com/client/log…`, там короткий
id без конвертации + дата в таймзоне компании) — при необходимости добавляется
тем же способом.

node --check 8/8 чисто, manifest → 0.6.1.

## 26. v0.6.2: бейдж застревал на ON после перезагрузки страницы

Симптом (сообщил пользователь): страницу перезагрузили — захват фактически
выключился, а возле иконки продолжает висеть «ON».

Причина: бейдж жил в service worker и переключался сообщением `fct-enabled`,
которое слал ПОПАП. Но настоящее состояние захвата — `liveEnabled` в content
script, и оно умирает вместе со страницей (так и задумано: перезагрузка = стоп).
Про эту смерть SW никто не уведомлял, поэтому он продолжал считать, что захват
идёт. Расхождение опасное: пользователь видит ON у выключённого расширения и
наоборот может считать, что защита работает.

Исправление — источником правды сделаны сами вкладки:
- content.js шлёт `fct-tab-state {enabled}` при каждом переключении И при
  загрузке страницы (там всегда `false`);
- SW держит `enabledTabs: Set<tabId>`, бейдж = набор непуст; `chrome.tabs`
  `onRemoved` (закрытие) и `onUpdated` со `status === "loading"`
  (перезагрузка/навигация) убирают вкладку из набора;
- из попапа сообщение `fct-enabled` убрано совсем, чтобы источник был один.

Побочно: `grabCount` теперь обнуляется, когда гаснет последняя вкладка.
Если SW успел уснуть и проснуться, набор пуст → бейдж покажет ВЫКЛ, а не
застрявший ON: ошибка в безопасную сторону.

Проверено вживую (Dry Run): включение → «ON»; перезагрузка страницы → бейдж
пуст и `fct-get-state` тоже отдаёт `enabled: false` (сходятся); уход на другой
адрес → пуст.

node --check 8/8 чисто, manifest → 0.6.2.

## 27. v0.7.0: turbo удалён полностью, остался только клик

Решение пользователя. Turbo к этому моменту работал (раздел 23: `turbo/taken`,
захват ~4 с против ~10 с у клика), так что удаление — не следствие поломки.
Восстанавливается из истории git при необходимости.

Удалено:
- `src/shared/turbo.js` целиком (файл убран и из manifest, и из списка
  ре-инъекции в popup.js);
- из `inject.js` — сборка payload, кеши компаний/водителей/токенов, фоновый и
  точечный предпрогрев, конвертация shortId→UUID и ссылка на внешний портал,
  мост `turbo-req`/`turbo-grab`/`turbo-prewarm`;
- вместе с ними — реестр `__fctTaskReg`, харвест TasksHistory и хуки
  WebSocket/EventSource: реестр существовал только ради turbo-поиска, а
  SSE-детект приносил задачу с настоящим TaskId, действовать по которому без
  turbo нельзя (клику нужна DOM-строка, а она ищется по хешу). Файл ужался с
  747 строк до 58;
- из `content.js` — обе turbo-ветки в `performGrab`, ветка «нет DOM-строки»
  (существовала только для SSE-пути), `openTransaction` и открытие вкладок
  (при клике платформа открывает их сама), приём `ws-task`, а также осиротевшие
  `rowSigOf` (нужна была для lookup по сигнатуре) и `sleep` (вытеснена `sleepV`
  ещё раньше);
- из `platform-config.js` — секция `turbo` и ставшая мёртвой секция `ws`
  (её ключи читал только удалённый `extractFromObject`), плюс `typeFromAny`,
  который вызывался только на ws-пути;
- из service worker — обработчик `fct-open-transaction`;
- из статистики — разбивка turbo/клик (все захваты теперь клик), в попапе
  осталось три плитки: взято за сегодня, среднее время, последний.

Что осталось в `inject.js`: только наблюдатель ответов на `InsertTransactions`
(fetch + XHR). Он нужен клик-пути: из изолированного мира ответы платформы не
видны, а по журналу это единственный способ отличить «клик не дошёл» (записи
нет вовсе) от «сервер отклонил» (HTTP 4xx/5xx).

Проверено после удаления: расширение грузится без ошибок, `__fctTaskReg`
отсутствует, ни одного запроса к Portals/CompanyAccessToken/PortalDrivers/
FlowProvider со страницы; детекция жива — за 45 с в Dry Run поймано 3 заявки и
корректно отсеяно по типу; попап рисуется, все 22 id на месте.

node --check 7/7 чисто, manifest → 0.7.0.

## 28. v0.7.1: платформа переименовала кнопку подтверждения

Симптом (сообщил пользователь): у транзакций портала eld88 диалог перестал
подтверждаться. Причина — платформа сменила надпись кнопки:

```
было:  Start transaction
стало: Start transaction (Platform ELD88)
```

Почему это ломало именно нас. Подтверждение у платформы — это
`<div class="custom-button">`, а не `<button>` (раздел 17). В `matchConfirm`
не-кнопке была доступна ровно одна ветка — ТОЧНОЕ равенство текста:

```js
if (t === "start transaction") return true;
if (!btnLike) return false;                              // ← div выходил здесь
if (t.indexOf("start transaction") !== -1) return true;  // сюда не доходило
```

Подстрочный поиск был намеренно ограничен кнопками — чтобы глобальный фолбэк
не кликнул `mat-icon` «create» (карандаш) в строках таблицы. С новым суффиксом
точное равенство перестало срабатывать, и кнопка не находилась вовсе: в журнале
«кнопка подтверждения не найдена в диалоге», диалог висел открытым.

Фикс: сравнение по НАЧАЛУ строки вместо равенства, доступное любым элементам
(`isConfirmText`), и тем же правилом пользуется `drillDown` — иначе он не
спускался к вложенному `<span>` с текстом. Сама надпись вынесена в конфиг
(`dialog.confirmPrefix`), раньше она была захардкожена в двух местах
content.js; следующее переименование правится одной строкой.

Ложные срабатывания проверены отдельно: «Cancel» не матчится, контейнер футера
не перехватывает (drillDown спускается к нужному элементу), глобальный фолбэк
по-прежнему не берёт карандаш «create» — префикс достаточно специфичен.

Проверка на живом диалоге eld88 (открыт вручную; открытие задачу НЕ забирает,
подтверждение не нажималось): элемент —
`div.mat-mdc-tooltip-trigger.mat-ripple.custom-button.primary`, текст
`start transaction (platform eld88)`, кандидат ровно один. A/B на копии этой
разметки: старое правило — «НЕ НАЙДЕНА → диалог зависает», новое — находит; на
старой надписи новое правило тоже работает (совместимость сохранена).

node --check 7/7 чисто, manifest → 0.7.1.
## 29. v0.7.2: расширение записывало себе ЧУЖИЕ захваты

Всплыло при боевой проверке фикса из раздела 28. В журнале — `grab / taken`,
но проверка на платформе показала: у той заявки (eld88, «New shift;Add to
Cycle», создана 14:36:51) исполнитель **другой оператор**, не наш аккаунт.

Улика, которой не хватало в самом журнале: не было записи
«платформа InsertTransactions → HTTP …». Наблюдатель в MAIN-мире фиксирует
такой запрос всегда, когда платформа его шлёт ИЗ НАШЕЙ вкладки. Раз записи
нет — POST не уходил, значит и транзакцию создали не мы.

Причина: `waitForTaken` считает успехом ЛЮБОЙ уход строки из «Not started»:

```js
const exec = cellText(row, C.dom.executorSelector);
if (exec) return "taken";           // ← кто именно исполнитель, не проверяется
```

Пока мы открываем диалог и подтверждаем, заявку может перехватить другой
оператор. Строка меняется — мы засчитываем это себе: ложный `grab` в журнале,
+1 в счётчиках, звук захвата. Оператор считает, что заявка взята, хотя она
ушла другому.

Фикс: уход строки больше не является доказательством. Захват засчитывается,
только если из этой вкладки ушёл `InsertTransactions` и сервер его принял.
`insert-observed` от inject.js теперь не только пишется в журнал, но и
запоминается (`lastInsert`); `insertSucceededSince(clickedAt)` ждёт этот
признак до 2.5 с (строка может обновиться чуть раньше, чем дойдёт postMessage).
Нет признака — пишем «заявку перехватил другой оператор», без grab и без
счётчиков.

Побочно это чинит и достоверность статистики: раньше в «взято за сегодня»
попадали чужие заявки.

Проверка фикса кнопки (раздел 28) в этот прогон не состоялась: первая попытка
пришлась ровно на перехват, вторая — таймаут 4.5 мин без единой свободной
eld88-заявки. Логика подтверждения проверена на реальном DOM живого диалога,
но полного боевого прохода «клик → подтверждение → наш InsertTransactions»
после переименования кнопки пока не было.

node --check 7/7 чисто, manifest → 0.7.2.

## 30. v0.7.3: фикс кнопки ПОДТВЕРЖДЁН + остановка холостого подтверждения

Боевой прогон (только eld88, любой тип) наконец дал прямое доказательство
фикса из раздела 28 — строка в журнале:

```
14:47:18  диалог: клик «start transaction (platform eld88)» №1
```

Переименованная кнопка найдена и нажата. До фикса на этом месте было
«кнопка подтверждения не найдена в диалоге».

Тот же прогон подтвердил и атрибуцию из раздела 29: заявку в этот момент
перехватил другой оператор, и вместо ложного `grab` записано
«заявку перехватил другой оператор (наш запрос не ушёл)».

Но всплыл третий дефект, видимый в том же журнале:

```
14:47:19  заявку перехватил другой оператор     ← performGrab вышел
14:47:20  диалог: клик «start transaction…» №2   ← а подтверждение продолжило
14:47:20  платформа InsertTransactions → HTTP 400
14:47:22  платформа InsertTransactions → HTTP 400
14:47:23  диалог: доверенный клик (debugger) №3
```

`autoConfirmTxnDialog()` запускается как «висячий» промис: `performGrab`
дожидается его только если строка не изменилась. Когда захват признан чужим,
функция возвращалась, а цикл подтверждения продолжал жить — досылал клики
(включая доверенный через chrome.debugger) по уже чужой заявке и получал
HTTP 400. Диалог при этом оставался открытым на экране.

Фикс:
- `autoConfirmTxnDialog(abort)` принимает общий флаг и проверяет его в обоих
  циклах (`stopped()` → возврат «отменено»); `performGrab` ставит
  `abort.stop = true` и при перехвате, и при успехе;
- `closeOpenDialog()` закрывает оставшийся диалог кнопкой отмены. Текст кнопки
  вынесен в конфиг (`dialog.cancelText`), поиск идёт по точному совпадению с
  спуском к самому глубокому носителю текста — проверено на копии реальной
  разметки: выбирается `div.custom-button «cancel»`, не подтверждение.

node --check 7/7 чисто, manifest → 0.7.3.

## 31. v0.7.4: выключение слайдера теперь действительно останавливает захват

Жалоба пользователя: «когда отключаю слайдер расширение все равно работает,
ужас», плюс «на иконке расширения не показывает ON» и «иногда слайдер сам
становится отключенным, хотя по факту расширение включено».

Разбор показал ЧЕТЫРЕ независимые причины, а не одну.

**1. Попап умирал посреди рассылки.** Рассылка «выключить» шла из попапа:
`chrome.tabs.query()` → `sendMessage` по каждой вкладке в цикле с `await`.
Контекст попапа уничтожается в момент закрытия и обрывает незавершённые
`await` — до части вкладок команда просто не долетала. Рассылка перенесена в
service worker (`fct-set-enabled-all`), где она идёт через `Promise.all` и не
зависит от жизни попапа.

**2. Бейдж стирался при пробуждении воркера.** Набор включённых вкладок жил
только в памяти воркера. MV3 усыпляет воркер через ~30 с простоя; проснувшись
на любом событии, он видел пустой набор и активно ГАСИЛ бейдж у работающего
захвата. Набор переехал в `chrome.storage.session` (живёт до закрытия браузера,
разрешений не требует), при старте — `restoreTabs().then(paintBadge)` со
сверкой, что вкладки ещё существуют.

**3. Слайдер опрашивал только активную вкладку.** Если попап открыт не на
странице платформы (или на второй вкладке), ответа не было и слайдер рисовался
выключенным при работающем захвате. Теперь попап спрашивает состояние у воркера
(`fct-enabled-state`) — тот знает про ВСЕ вкладки.

**4. Уже начатый захват не проверял выключение.** Это и есть «ужас»: даже когда
команда доходила, `liveEnabled=false` не влиял на работу, начатую раньше.
Проверок добавлено четыре:
- `flush()` в engine-core выбрасывает очередь, если захват выключен между
  `submit` и `flush` (окно 25 мс, но именно в него попадает пачка заявок);
- `performGrab` выходит на входе и повторно — после паузы «под человека»
  (0.3–1.2 с, самый вероятный момент для выключения);
- `waitForTaken()` перестаёт ждать;
- `stopped()` в `autoConfirmTxnDialog` учитывает `liveEnabled`, поэтому цикл
  подтверждения не дожимает диалог после «выкл»; диалог при этом закрывается
  через `closeOpenDialog()`.

Проверено на живом профиле (Dry Run, две вкладки платформы): включение → бейдж
`ON`, `count: 2`, обе вкладки `enabled: true`; выключение → обе вкладки
`enabled: false`, `enabledTabs: []`, бейдж пуст; переоткрытие попапа поверх
НЕ-платформенной вкладки → слайдер читается `true`; после 50 с простоя бейдж
остаётся `ON`.

### Диалог после успешного взятия

Раньше `closeOpenDialog()` вызывался только на пути перехвата. На успехе диалог
оставался открытым, если платформа не закрывала его сама (у транзакций
стороннего портала — обычное дело). Добавлен `closeDialogAfterGrab()`: до 4 с
ждём, не закроется ли окно само, и только потом жмём «Cancel». Транзакция к
этому моменту уже создана, отмена диалога на неё не влияет.

### Звук

Был одиночный синус 880 Гц с атакой 10 мс — резкий. Стало: две ноты C6→G6
треугольной волной, атака 40 мс, затухание 180/340 мс, пик громкости 0.09
вместо 0.25, сверху фильтр НЧ 2 кГц. Плюс `ctx.resume()` при `suspended` — без
жеста пользователя контекст мог стартовать заглушённым. Выключается тумблером
«Звук при захвате» (`soundOnGrab`), он был и раньше.

node --check 7/7 чисто, manifest → 0.7.4.

## 32. v0.7.5: главная причина «берёт при выключенном слайдере» — осиротевший движок

После v0.7.4 пользователь: «все равно иногда берет даже если выключен».
Проверки внутри вкладки были на месте, но у них есть слепая зона.

**Осиротевший content script.** При перезагрузке или обновлении расширения
контекст расширения умирает, а скрипт, УЖЕ внедрённый в открытую вкладку,
продолжает жить: MutationObserver работает, очередь работает, `liveEnabled`
остался `true`. Сообщения до него больше не доходят — ни `fct-set-enabled`, ни
`fct-get-state`. Такая вкладка:

- не видна воркеру (бейдж пуст, попап показывает «выкл»);
- не выключается ничем, кроме перезагрузки страницы;
- работает по СТАРОМУ `state.cfg` — включая `dryRun`, каким он был на момент
  внедрения;
- пишет в журнал через `chrome.storage`, где вызов падает и глушится
  `.catch(() => {})`, поэтому берёт заявки МОЛЧА.

Отсюда и «иногда»: ровно после каждой перезагрузки расширения, если вкладка
платформы оставалась открытой. За время разработки это происходило постоянно.

Признак смерти контекста — пропавший `chrome.runtime.id`. Добавлены:

- `contextAlive()` — проверка внутри общего `armed()`;
- сторож `setInterval(2000)` → `shutdown()`: отключает MutationObserver,
  гасит флаги навсегда и пишет предупреждение в консоль страницы;
- метка состояния в DOM: `<html data-fct="on|off|stopped">`. Скрипт живёт в
  изолированном мире, и без метки снаружи (консоль страницы, тесты) вообще
  нельзя было понять, жив ли захват в этой вкладке.

**Второй слой — глобальный стоп-кран.** `chrome.storage.local.captureOn` пишет
воркер (`persistTabs()`), читают все вкладки через `storage.onChanged`. Событие
storage доходит туда, куда может не дойти `sendMessage` (фоновая вкладка,
гонка при закрытии попапа, спящий воркер). Захват идёт только при
`liveEnabled && captureOn && contextAlive()` — это и есть `armed()`, и он
проверяется на каждом шаге, включая последнюю строчку перед `dispatchClick()`.

Разделение ролей: `liveEnabled` включает КОНКРЕТНУЮ вкладку и умирает вместе со
страницей (захват не оживает сам после перезагрузки), `captureOn` — общий
рубильник, который может только выключить.

Проверено на живом профиле (Dry Run):

| Сценарий | Результат |
|---|---|
| Включить | `data-fct="on"`, `captureOn: true`, бейдж `ON`, `armed: true` |
| Перезагрузить расширение при открытой вкладке | через ~2 с `data-fct="stopped"` + предупреждение в консоли |
| Уронить только `captureOn`, вкладке ничего не слать | `enabled: true`, но `armed: false` |
| Штатное выключение | `armed: false`, `captureOn: false`, бейдж пуст |

node --check 7/7 чисто, manifest → 0.7.5.

## 33. v0.8.0: самодиагностика и панель на странице

Две новые возможности, обе выросли из уже случившихся проблем.

### Самодиагностика

Платформа дважды меняла разметку под нами (раздел 28 — переименование кнопки
подтверждения), и оба раза захват ломался МОЛЧА: селектор не находит элемент,
заявка просто не берётся, бейдж при этом зелёный. Внешне это неотличимо от
«сегодня мало заявок», и узнавали мы об этом к концу смены.

**Активная проверка.** Кнопка «Проверить платформу» в попапе шлёт вкладке
`fct-diagnose`; `runDiagnostics()` прогоняет по живой странице всё, на чём
держится захват, и возвращает список проверок с тремя состояниями: ✓, ✕ и
«не проверено». Третье состояние обязательно: диалог транзакции видно только
когда он открыт, и путать это с поломкой нельзя.

Что проверяется: таблица, мост MAIN-мира (`data-fct-bridge` — без inject.js
захваты считались бы чужими), строки, типы задачи, статус, исполнитель, портал,
полнота ключа заявки (дата+компания+водитель — при неполном возможны ложные
дубли), кнопка захвата, а при открытом диалоге — кнопки подтверждения и отмены.

Правило совпадения надписи подтверждения вынесено в общий `isConfirmLabel()`:
проверка и захват обязаны использовать ОДИН код, иначе «проверка пройдена»
перестаёт что-либо значить.

**Пассивный сторож.** Считает подряд идущие СТРУКТУРНЫЕ отказы («не нашёл
элемент»), но не гонки («заявку увёл другой оператор») — второе в порядке вещей.
Два отказа подряд → `{ok:false}` в `storage.local.health` → воркер поднимает
красный бейдж `!`, попап показывает баннер, панель на странице краснеет.
Отдельно: если через 15 с после загрузки страницы задач таблицы нет — тревога
сразу. Тревога снимается успешным захватом, чистой проверкой или включением
захвата (иначе вчерашний диагноз светит вечно).

Проверено ломанием селектора вживую: `.mat-column-TransactionBROKEN` →
✕ в отчёте → баннер → бейдж `!`; после отката — «все проверки пройдены».

### Панель на странице + Ctrl+Shift+Y

Чтобы узнать состояние захвата, приходилось открывать попап — на этом ловились
все прошлые сюрпризы со слайдером (разделы 31–32). Панель в правом нижнем углу
показывает состояние (ВЫКЛ / DRY RUN / ЗАХВАТ / ОСТАНОВЛЕН), счётчик за смену и
переключает захват кликом — через тот же `fct-set-enabled-all`, что и попап, так
что состояние остаётся единым.

Живёт в shadow DOM: стили Angular Material до неё не дотягиваются, а её
собственные мутации не всплывают в MutationObserver движка. Выключается
тумблером «Панель на странице».

Горячая клавиша `Ctrl+Shift+Y` (`chrome.commands`) переключает захват, не
открывая попап; клавиша меняется в chrome://extensions/shortcuts. Проверить её
из Playwright нельзя — команды расширения обрабатывает браузер, а не страница;
проверена только регистрация через `chrome.commands.getAll()`.

### Попутный баг

Скриншот попапа поймал то, чего не видела проверка свойств: баннер с
`hidden` продолжал отображаться. `.health-banner{display:flex}` в авторском CSS
перебивает браузерное `[hidden]{display:none}` — специфичность класса выше.
Лечится строкой `.health-banner[hidden]{display:none}`.

node --check 7/7 чисто, manifest → 0.8.0.

## 34. v0.8.1: панель только на странице задач

Пользователь: панель должна быть только на странице задач. На логине, компаниях
и отчётах захватывать нечего, и она там только мешает.

Условие показа — наличие ТАБЛИЦЫ (`C.dom.tableSelector`), а не совпадение URL:
платформа это SPA, маршрут меняется без перезагрузки страницы, никаких событий
загрузки при этом нет, а таблица либо есть в DOM, либо нет. `syncPanel()`
вызывается из трёх мест: при готовности страницы, из debounce-таймера пересканa
(ловит появление таблицы за ~150 мс) и из сторожа сиротства раз в 2 с
(страховка, если мутаций не было вовсе).

Проверено: на `/companies` панели нет; SPA-переход на `/tasks` без перезагрузки
— панель появилась сама; обратный переход — исчезла.

### Заодно уточнение про окно в 2 секунды

В разделе 33 было сказано, что между смертью контекста и тиком сторожа захват
теоретически успеет начаться. Это неверно: `armed()` вызывается синхронно перед
каждым шагом, включая строку прямо перед `dispatchClick()`, а `chrome.runtime.id`
пропадает в тот же миг, когда контекст умирает. Захват невозможен с первой
миллисекунды. Сторож раз в 2 с занимается только уборкой: отключает observer,
ставит `data-fct="stopped"`, красит панель и пишет предупреждение в консоль.

node --check 7/7 чисто, manifest → 0.8.1.

## 35. v0.8.2: панель перекрывала интерфейс платформы

Пользователь: «мелкая кнопка снизу справа немного закрывает сам интерфейс
флоу». Панель 110×28 в правом нижнем углу ложилась на строку пагинации
(«Items per page», «Total»).

Любое ФИКСИРОВАННОЕ место рано или поздно что-нибудь закроет, поэтому решение
из двух частей:

- **В покое панель свёрнута до точки 22×22 и притушена (opacity .5).** Надписи
  (состояние, счётчик за смену) разворачиваются только под курсором. Свободного
  места в самом углу хватает — теперь она стоит правее «Total» и ни на что не
  ложится.
- **Панель перетаскивается мышью**, позиция запоминается в `localStorage`
  (`__fct_panel_pos`) и загоняется в границы окна при загрузке и на resize —
  сохранённая координата могла остаться от монитора побольше.

Перетаскивание и клик висят на одной кнопке мыши, поэтому клик засчитывается
только если курсор сдвинулся меньше чем на 5 px по сумме осей: иначе каждое
перетаскивание переключало бы захват.

Тревожное состояние теперь видно и в свёрнутом виде: точка краснеет и мигает
(`@keyframes fctPulse`), разворачивать панель для этого не нужно.

Проверено вживую: свёрнутая — 22×22 в углу, opacity .5; под курсором — 81×28,
opacity 1, надпись «ВЫКЛ»; перетаскивание мышью на (140, 287) — позиция
сохранилась и пережила перезагрузку страницы, захват при этом НЕ переключился;
обычный клик по-прежнему включает захват.

node --check 7/7 чисто, manifest → 0.8.2.

## 36. v0.8.3: штатная остановка попадала в «Ошибки» расширения

Пользователь прислал скриншот chrome://extensions → «Ошибки»: там висело наше
собственное сообщение «движок остановлен: расширение перезагружено или
обновлено» со стеком до `content.js (shutdown)`.

Причина: Chrome собирает `console.warn` и `console.error` из content script в
список ошибок расширения. Штатная, ожидаемая остановка осиротевшего движка
(раздел 32) выглядела там как поломка.

Заменено на `console.info` — в список ошибок такие записи не попадают, а для
отладки в консоли страницы сообщение остаётся. Пользователю об остановке
говорит панель, и теперь она делает это заметно: состояние «ОСТАНОВЛЕН · F5»
разворачивается ВСЕГДА, не дожидаясь наведения мыши, и красится в янтарный.
Это единственное состояние, требующее действия пользователя, поэтому прятать
его под hover нельзя. Клик по панели в этом состоянии перезагружает страницу.

node --check чисто, manifest → 0.8.3.
