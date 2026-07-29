# TicketMe

TicketMe е multi-event платформа за откриване и заявяване на билети с
production-oriented архитектура. Интерфейсът е локализиран на български и
английски и е оптимизиран за desktop и mobile.

Началният snapshot съдържа **126 source listings**: 125 публични записа от
Bilet.bg и едно featured събитие от Eventim. Изтеклите записи автоматично
отпадат от публичния каталог. Към него могат да се добавят публикувани записи
от постоянния discovery каталог в PostgreSQL. Всеки активен запис има
собствена страница; външно откритите събития водят към оригиналния източник и
никога не получават измислен TicketMe inventory или цена.

Snapshot-ът е нормализиран от публичния календар на
[Bilet.bg](https://www.bilet.bg/bg) и публичната страница на
[Deep Purple в Eventim](https://www.eventim.bg/en/artist/deep-purple/).

> [!IMPORTANT]
> Публичните listings са discovery записи, а не TicketMe inventory. Live
> checkout се активира само за събития с изрично организаторско право,
> договорена наличност, завършено Stripe onboarding и production webhook.
> Използвай test keys и Stripe test cards единствено в local/staging среда.

## Какво е реализирано

- Начална marketplace страница и каталог с търсене, категории, град,
  сортиране и pagination.
- 126 отделни rights-safe cover assets с category-matched photography и
  deterministic event-specific crop/color direction; official artwork не се
  hotlink-ва без изрични права.
- Пълни `/bg` и `/en` публични routes с language switcher, локализирани
  metadata, checkout, email и PDF съдържание.
- Отделни detail страници за всички активни listings, с metadata и structured
  event data; изтеклите директни URL-и връщат not-found.
- Единна email/password login страница за клиенти и администратори.
- Професионална регистрация с password strength, email verification и
  отделни роли в базата.
- Hosted Stripe Checkout само за потребители с потвърден имейл.
- 30-минутна inventory reservation с автоматично освобождаване при изтекъл
  Checkout Session.
- Idempotent Stripe webhook fulfillment и success-page recovery path.
- Ticket-category модел с отделен капацитет и цена за organizer-owned
  събития; source-only listings нямат локален inventory.
- Уникален PDF дизайн според събитието и билета, с купувач, категория,
  admission label и QR код с безопасна quiet zone.
- Private cloud storage за PDF файловете и защитено изтегляне през сайта.
- PDF attachment и download линк в transactional email след заявката.
- Наличности в реално време чрез Server-Sent Events (SSE), без refresh.
- Durable FIFO опашка в PostgreSQL и атомарно издаване без oversell.
- Потребителска секция за достъп до собствените билети.
- Админ панел за поръчки и еднократен QR check-in.
- Health endpoint за readiness проверка на production интеграциите.
- Периодично откриване от изрично разрешени RSS, Atom, ICS и JSON feeds.
- Строга source validation, SSRF защита, fingerprint deduplication и
  PostgreSQL audit trail за всяко discovery изпълнение.
- Organizer review queue с ръчно publish/reject и опционално auto-publish за
  предварително одобрени източници.
- Опционално server-side Gemini 3.5 Flash-Lite обогатяване само за
  категоризация, превод и editorial ranking, с deterministic fallback.

## Покритие на изискванията

| Изискване | Реализация |
| --- | --- |
| Лендинг страница | `/bg` и `/en` показват featured събитие, категории и селекции от каталога. |
| Два езика | Locale routing, switcher, localized metadata, UI, email/PDF и Stripe Checkout locale. |
| Email verification | 30-минутен еднократен hashed token; билет може да заяви само потвърден профил. |
| Stripe плащане | Server-created hosted Checkout Session; fulfillment само след verified Stripe event или server-side success fallback. |
| PDF билет | `pdf-lib` генерира PDF с име, данни за събитието, категория, admission label и QR код. |
| Cloud storage | В production PDF-ите се записват в private Cloudflare R2 или AWS S3 bucket. |
| Email доставка | Resend изпраща PDF attachment и защитен линк за изтегляне. |
| Изтегляне от сайта | Собственикът на билета или администратор може да го изтегли през защитен route. |
| Live наличности | Event-scoped SSE stream изпраща промените към всички отворени клиенти. |
| Честна опашка | PostgreSQL `purchase_queue` подрежда reservation заявките по `BIGSERIAL` позиция за всяка event/category lane. |
| Без oversell | Guarded inventory decrement и reservation insert са в една PostgreSQL транзакция под advisory и row lock. |
| Натоварване | Кратката DB транзакция пази наличността; Stripe, PDF, storage и email I/O са извън allocation critical section. |
| Добра архитектура | UI, route handlers, domain services и provider adapters са разделени по отговорности. |
| Сигурност | Scrypt password hashes, opaque server-side sessions, authorization, rate limiting, parameterized SQL и security headers. |
| Deploy | Next.js приложението се deploy-ва във Vercel; PostgreSQL, Resend, Stripe и private S3/R2 остават зад readiness gates. |
| Актуален каталог | Daily/monthly scheduler чете само разрешени feeds, deduplicate-ва записите и ги подава към admin review или доверено auto-publish. |

Бонусите с реална Stripe Checkout интеграция, билетни категории, multi-event
каталог, admin панел и QR верификация също са реализирани. Избор на конкретно
място от карта на зала не е част от тази версия.

## Технологии

- Next.js 16 App Router, React 19 и TypeScript
- Tailwind CSS 4
- PostgreSQL чрез `postgres`
- Node.js `scrypt` за salted password hashing и SHA-256 за opaque tokens
- Stripe Node SDK и hosted Stripe Checkout
- Server-Sent Events за live inventory
- `pdf-lib`, `@pdf-lib/fontkit` и Noto Sans за PDF с кирилица
- `qrcode` за входен QR код
- Resend за transactional email
- AWS SDK S3 client за Cloudflare R2 или AWS S3
- Gemini Interactions REST API за опционално Gemini 3.5 Flash-Lite enrichment без Search
  grounding или URL Context
- `fast-xml-parser` и `node-ical` за bounded RSS/Atom/ICS parsing

## Архитектура

`src/app` съдържа страниците и тънките HTTP route handlers. `src/components`
съдържа marketplace и checkout UI. Бизнес логиката е в `src/lib`, а
нормализираният каталог е в `src/data`.

```text
Browser
  ├─ Next.js pages / route handlers
  ├─ SSE availability stream
  ├─ opaque HttpOnly session cookie
  └─ redirect ─────────────────────► Stripe-hosted Checkout
          │
          ▼
Domain services
  ├─ auth + authorization
  ├─ FIFO reservation queue
  ├─ inventory + reservations + tickets
  ├─ licensed-feed discovery + validation + deduplication
  ├─ optional Gemini enrichment ─────► Gemini 3.5 Flash-Lite
  ├─ organizer review / trusted auto-publish
  ├─ Stripe webhook fulfillment
  ├─ PDF + QR generation
  ├─ email adapter ─────────► Resend
  └─ storage adapter ───────► Cloudflare R2 / AWS S3
          │
          ▼
      PostgreSQL
```

### Locale routing

Публичните URL-и винаги имат locale prefix:

- `/bg`, `/bg/events`, `/bg/events/[slug]`, `/bg/login` и останалите
  български страници;
- `/en`, `/en/events`, `/en/events/[slug]`, `/en/login` и останалите
  английски страници.

Заявка към `/` или друг публичен URL без prefix се пренасочва според
`ticketme_locale` cookie, след това според `Accept-Language`, с fallback към
`bg`. Това е `307` redirect, а locale cookie-то се пази една година.
Switcher-ът в header-а сменя locale-а, като запазва текущите path и query.
API routes и static/metadata assets остават без prefix. Sitemap-ът публикува и
двата езика с language alternates.

### Stripe Checkout и ticket fulfillment

1. `POST /api/stripe/checkout` изисква buyer сесия с потвърден имейл,
   проверява same-origin заявката, валидира `eventId`, категорията и locale-а
   и прилага rate limit.
2. Production заявката влиза директно в постоянната PostgreSQL FIFO lane за
   `eventId:ticketType`. Само най-малката активна `BIGSERIAL` позиция може
   атомарно да намали inventory и да създаде checkout reservation.
3. Сървърът създава 30-минутен Stripe Checkout Session с reservation ID в
   metadata и връща hosted `checkoutUrl`. Browser-ът прави redirect към Stripe;
   не зарежда Stripe.js и не се нуждае от publishable key.
4. Stripe изпраща `checkout.session.completed` към webhook route-а. След
   проверка на webhook signature приложението изпълнява една idempotent
   транзакция, която превръща reservation-а в точно един билет. Уникалните
   reservation, Checkout Session и PaymentIntent връзки правят повторно или
   разместено събитие безопасно.
5. Генерират се QR и локализиран PDF, файлът се качва в private object storage,
   а Resend изпраща локализиран email. Delivery claim/lease позволява безопасен
   retry, без да се създава втори билет.
6. При `checkout.session.expired` активната reservation се освобождава
   idempotently и билетът се връща в наличността. Изтеклите локални reservations
   също се почистват при inventory операции, така че пропуснат webhook не може
   да заключи билет завинаги. При отказ cancelled страницата първо заявява
   изтичане на Stripe Session-а и след това възстановява inventory.
7. `/{locale}/checkout/success?session_id=...` проверява Checkout Session-а
   server-side. Ако webhook-ът се забави, страницата извиква същия idempotent
   fulfillment path; ако webhook-ът вече е приключил, показва съществуващия
   билет.

Stripe Checkout Session-ът и нормалният inventory hold са 30 минути.
`checkout.session.expired` освобождава reservation-а веднага след този
прозорец. Persistence expiry е 35 минути — петминутен failsafe grace при
закъснял или пропуснат webhook — и `getAvailability`/следваща allocation
почистват такъв hold. FIFO requester lease-ът, polling backoff-ът и
30-секундният queue timeout са отделни от Checkout reservation срока.

В local JSON режим същият reservation/fulfillment договор се изпълнява от
in-process FIFO lane и file mutation lock. В production `DATABASE_URL` е
задължителен.

### Realtime наличности

`GET /api/events?eventId=...` отваря SSE stream. Един shared channel на
application instance обслужва всички локални subscribers за събитието,
изпраща незабавни локални промени и проверява PostgreSQL на всеки 3 секунди за
покупки, обработени от други instances. Heartbeat пази връзката активна.

### Persistence adapters

- **Production:** PostgreSQL държи users, hashed verification/session tokens,
  роли, inventory, FIFO queue, Checkout reservations, Stripe linkage, tickets,
  delivery state и audit log. Schema migrations се изпълняват отделно преди
  стартиране на приложението; production runtime няма нужда от DDL права.
- **Local development:** `.data/auth.json` пази профилите и сесиите, а
  `.data/db.json` пази inventory, reservations, tickets и audit log. Стар v2
  ticket-store файл се upgrade-ва автоматично до reservation-aware v3. JSON
  adapter-ите умишлено са забранени при `NODE_ENV=production`.

Изпълни migrations с migration/admin role:

```bash
npm run db:migrate
```

Migration `002` добавя Checkout reservations, Stripe session/payment
идентификатори, уникални idempotency constraints и retry-safe delivery state.
Migration `003` добавя users, roles, hashed email-verification tokens и
server-side sessions. Runner-ът записва checksum за всяка приложена migration
в `schema_migrations` и отказва да изпълни променена стара migration.
Migration `004` добавя persistent discovery catalog, source provenance,
review lifecycle, deterministic deduplication constraints и run audit history.

### AWS RDS PostgreSQL

Приложението използва един shared Postgres.js pool вместо отделни auth и
ticket pools. При AWS RDS връзката fail-ва затворено, ако липсва AWS CA bundle,
и използва hostname verification, `rejectUnauthorized: true` и минимум TLS 1.2.

1. Предпочети private RDS и security-group правило за TCP `5432` със source
   application security group. За временно локално свързване разреши само
   собствения `/32` IP; никога `0.0.0.0/0`.
2. Изтегли публичния AWS trust bundle:

   ```bash
   curl -o global-bundle.pem \
     https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
   ```

3. В `.env.local` попълни password-а локално, без да го изпращаш в chat:

   ```dotenv
   DATABASE_URL=""
   DATABASE_HOST="database-1.cc1caw88ki2i.us-east-1.rds.amazonaws.com"
   DATABASE_PORT="5432"
   DATABASE_NAME="mydb"
   DATABASE_USER="postgres"
   DATABASE_PASSWORD="replace-only-in-env-local"
   DATABASE_SSL_CA_PATH="./global-bundle.pem"
   DATABASE_POOL_MAX="5"
   DATABASE_AUTO_MIGRATE="false"
   ```

   Отделните полета са предпочитани за локална настройка, защото password с
   `@`, `/`, `?` или `#` се URL-encode-ва безопасно. `DATABASE_URL` остава
   поддържан за hosting доставчици.
4. Приложи и провери schema-та:

   ```bash
   npm run db:migrate
   npm run db:check
   ```

   `db:check` показва само host, database, user, schema и TLS статус — никога
   password-а или connection URL.
5. За production използвай отделен least-privileged application role в
   `DATABASE_URL` и migration/admin role в `MIGRATION_DATABASE_URL`.

При преминаване към PostgreSQL съществуващите `.data/auth.json` и
`.data/db.json` не се импортират автоматично и остават непокътнати като local
archive.

### Автоматично откриване на събития

Discovery pipeline-ът не scrape-ва произволни сайтове. Той приема само
изрично конфигурирани HTTPS RSS, Atom, iCalendar или JSON feeds, за които
операторът има право да съхранява и публикува данните:

```dotenv
EVENT_DISCOVERY_FEED_URLS='[
  "https://events.example.org/feed.json",
  "https://organizer.example.com/calendar.ics"
]'
EVENT_DISCOVERY_ALLOWED_HOSTS='[
  "tickets.example.org",
  "*.organizer-partner.example"
]'
EVENT_DISCOVERY_MAX_EVENTS="40"
EVENT_DISCOVERY_LOOKAHEAD_DAYS="180"
EVENT_DISCOVERY_AUTO_PUBLISH="false"
CRON_SECRET="generate-at-least-32-random-characters"
GEMINI_API_KEY=""
```

`EVENT_DISCOVERY_ALLOWED_HOSTS` е необходим само когато event link от feed-а
е на различен hostname. Обикновен hostname разрешава само точното име;
`*.example.org` разрешава subdomains, но не и apex домейна.

При всяко изпълнение:

1. URL allowlist, DNS и IP проверките блокират localhost, private/reserved
   мрежи, credentials, custom ports, неразрешени redirects и прекалено големи
   отговори.
2. Parser-ът приема само bounded event metadata. Контакти, attendees, цена,
   capacity и HTML не се импортират.
3. Изтеклите или прекалено далечни събития отпадат. SHA-256 fingerprint,
   canonical source URL и provider event ID премахват дубликатите.
4. Ако е конфигуриран допустим `GEMINI_API_KEY`, моделът
   `gemini-3.5-flash-lite` получава само title, description, city, venue и
   date. Той може да превежда, категоризира и изчислява editorial appeal
   score; няма Search tool, URL Context, personal data или commerce facts.
   Липсващ, невалиден или недостъпен Gemini автоматично използва
   deterministic classifier.
5. Записът се upsert-ва транзакционно като `sale_mode='external'`. По
   подразбиране статусът е `pending` и се преглежда в
   `/{locale}/admin/discovery`. При предварително одобрени feeds
   `EVENT_DISCOVERY_AUTO_PUBLISH=true` го публикува автоматично.
6. Публичният каталог, event страниците и sitemap-ът включват само
   `published` бъдещи записи. External listings никога не минават през
   TicketMe inventory или Stripe и водят към оригиналния source URL.

Ръчно organizer изпълнение се стартира от admin страницата. `vercel.json`
извиква endpoint-а веднъж дневно чрез Vercel Cron, а Vercel подава
`Authorization: Bearer <CRON_SECRET>` автоматично. За друг trusted scheduler:

```bash
curl --fail-with-body --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.example/api/cron/events/discover
```

Endpoint-ът приема `GET` за Vercel Cron и `POST` за външни scheduler-и,
изисква минимум 32-знаков secret, сравнява го constant-time и използва
PostgreSQL advisory lock, така че две едновременни изпълнения не могат да се
застъпят. `EVENT_DISCOVERY_CRON_SECRET` се поддържа само като legacy fallback.
Всеки run записва status, model, window и created/updated/rejected counters в
`event_discovery_runs`.

Migration `004_event_discovery.sql` добавя `catalog_events`,
`catalog_event_sources` и `event_discovery_runs`. Изпълни я чрез общия runner:

```bash
npm run db:migrate
```

> [!WARNING]
> Публикуваният в chat или screenshot API key вече не е secret — revoke-ни го
> и създай нов. Запиши replacement-а само в `.env.local` или secret manager.
> Текущите [Gemini API terms](https://ai.google.dev/gemini-api/terms)
> забраняват Search-grounded results да се използват за автоматично
> изграждане на база и забраняват Gemini API като част от приложение, което
> вероятно се използва от лица под 18 г. За TUES-facing deployment остави
> `GEMINI_API_KEY` празен и използвай deterministic pipeline-а или
> self-hosted модел след отделен legal review. В EEA public API client също
> изисква paid service.

## Избор на външни услуги

### Payments: Stripe hosted Checkout

Избран е Stripe-hosted Checkout, защото чувствителните payment полета се
показват на Stripe domain, поддържат locale и mobile UX и оставят приложението
да работи с server-created Checkout Sessions и подписани webhooks. Payment
Element би дал повече visual control, но изисква Stripe.js, publishable key и
по-голяма client integration повърхност.

Checkout е ограничен до незабавно потвърждаваните card rails. Stripe третира
Apple Pay и Google Pay като card wallets и ги показва, когато са активирани и
browser-ът, устройството, държавата и настроеният wallet са допустими.
Забавените банкови методи нарочно са изключени, защото могат да приключат след
35-минутната резервация. Wallet плащанията минават през същото server-side
amount, currency, metadata и fulfillment валидиране като обикновена карта.
Всяка Checkout Session override-ва тестовото account име с публичния бранд
`TicketMe` и използва същите цветове и типография като marketplace UI.
Stripe запазва видима `Sandbox` индикация при test-mode сесии; тя изчезва
единствено при реална live-mode Checkout Session.

Тази архитектура **не изисква client publishable key**. Единствените Stripe
стойности са server-only `STRIPE_SECRET_KEY` и отделен
`STRIPE_WEBHOOK_SECRET`. Не добавяй `NEXT_PUBLIC_STRIPE_*` променлива, не
записвай ключове в кода и никога не ги commit-вай.

За local и staging проверки използвай единствено Stripe sandbox/test mode.
Никога не въвеждай ръчно реални картови данни в Checkout; за картовата форма
използвай Stripe test cards. Показването на Apple Pay или Google Pay може да
изисква вече настроена карта в съответния wallet, но `sk_test_...` запазва
транзакцията в Stripe test mode.

Source snapshot-ът съдържа legacy цени в BGN. При нормализиране на каталога те
се конвертират еднократно в EUR по официалния фиксиран курс
`1 EUR = 1.95583 BGN`, закръглени до евроцент. UI, metadata, Stripe Checkout,
fulfillment проверките и PDF билетите използват една и съща EUR стойност.

### Email: Resend

| Опция | Предимства | Компромис |
| --- | --- | --- |
| **Resend — избрана** | Малък TypeScript API, лесна domain verification, добра работа с HTML и PDF attachments. | Изисква верифициран sending domain и следене на provider limits. |
| Amazon SES | Много добър избор при голям обем и AWS инфраструктура. | Повече IAM, sandbox, DNS и operational настройка за този scope. |
| Postmark | Силен transactional фокус и добри delivery инструменти. | Отделен provider и ценови модел без съществено предимство за този scope. |

Resend дава най-краткия и ясен production path за verification и ticket
email-ите. В development същият adapter пише съдържанието в
`.data/outbox.log`, а интерфейсът продължава директно към локалната
verification стъпка, за да не е необходим външен акаунт.

### Storage: Cloudflare R2 през S3 API

| Опция | Предимства | Компромис |
| --- | --- | --- |
| **Cloudflare R2 — препоръчана** | S3-compatible API, private buckets и удобен модел за често изтегляни файлове. | Изисква endpoint и R2 API credentials. |
| AWS S3 | Зрял IAM, lifecycle и audit ecosystem; adapter-ът работи без промяна. | По-голяма AWS конфигурация за малък проект. |
| Cloudinary | Отличен за image transformations и media delivery. | PDF билетите са private documents, за които object storage е по-пряк модел. |

Bucket-ът остава private. Клиентът не получава storage credentials или public
object URL; приложението проверява собствеността на билета и връща файла през
`/api/tickets/:id/download`.

## Стартиране локално

Необходими са Node.js 20.9+ и npm.

```bash
npm ci
cp .env.example .env.local
```

За най-краткия локален checkout flow добави собствен Stripe **test-mode**
secret key в `STRIPE_SECRET_KEY`. Това е достатъчно, за да се отвори hosted
Checkout и success страницата да провери плащането и да издаде билета.
Publishable `pk_test_...` key не се използва, защото картовата форма е на
Stripe.

В Stripe sandbox включи Card, Apple Pay и Google Pay в default payment-method
configuration. Hosted Checkout не изисква wallet SDK в приложението. Wallet
бутонът се вижда само когато методът е активиран и устройството, browser-ът,
държавата и настроеният Apple Wallet или Google Wallet са допустими; при
останалите устройства Stripe показва картовата форма.

В test-mode средата Stripe Link е изключен, за да не конкурира
Apple Pay/Google Pay и да не показва legacy sandbox account името в текста за
запазване на платежни данни. Преди повторно включване на Link промени
customer-facing Business name на `TicketMe` от Stripe Dashboard →
Settings → Business details.

`STRIPE_WEBHOOK_SECRET` не е задължителен за този локален happy path. За
тестване на надеждния асинхронен production flow инсталирай и authenticate-ни
Stripe CLI, след което стартирай webhook forwarding в отделен terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

CLI извежда отделен webhook signing secret. Запиши го в
`STRIPE_WEBHOOK_SECRET` в `.env.local`, без да го commit-ваш. Независимо кой
локален режим избираш, стартирай приложението:

```bash
npm run dev
```

Отвори [http://localhost:3000](http://localhost:3000); root route-ът ще избере
`/bg` или `/en`. Ако промениш env стойност, рестартирай development server-а.

Можеш да оставиш `DATABASE_URL`, `RESEND_API_KEY` и S3 полетата празни в
development. Приложението ще използва:

- `.data/auth.json` за users, roles, hashed tokens и sessions;
- `.data/db.json` за inventory, reservations, tickets и audit log;
- `.data/storage/tickets` за PDF файловете;
- `.data/outbox.log` за email съдържанието.

Без `STRIPE_SECRET_KEY` сайтът и authentication flow-ът могат да се разглеждат,
но Checkout endpoint-ът fail-ва безопасно с `503`.

Създай профил с име, email и парола. Когато Resend не е конфигуриран,
регистрацията отваря директно страницата за локално потвърждение и ясно
показва, че не е изпратен реален email. Копие остава в `.data/outbox.log`
за debugging. При конфигуриран Resend потребителят получава нормален email
и се връща към login страницата.

### Resend за произволни получатели

`onboarding@resend.dev` е само тестов sender и може да изпраща единствено до
email адреса на собственика на Resend акаунта. Кодът на TicketMe не
ограничава получателите, но реална доставка до Gmail, Outlook, Yahoo или
корпоративен адрес изисква собствен потвърден sending domain:

1. Добави домейн или dedicated subdomain, например `mail.your-domain.com`, в
   Resend Dashboard → Domains.
2. Добави точно генерираните от Resend SPF/MX и DKIM DNS записи при DNS
   доставчика на домейна.
3. Изчакай статус `Verified`.
4. Промени server-only конфигурацията и рестартирай приложението:

   ```dotenv
   MAIL_FROM="TicketMe <tickets@mail.your-domain.com>"
   ```

След това същият signup и ticket-delivery код изпраща до всеки валиден
recipient адрес. Production health check-ът умишлено остава `degraded`, ако
sender-ът още използва `resend.dev`. Виж
[Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
и [Resend 403 test-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Admin няма отделен ключ или отделна login форма. За да дадеш admin роля на
вече регистриран и потвърден профил, изпълни:

```bash
npm run user:promote -- your-email@example.com
```

Командата използва local JSON adapter-а без допълнителна настройка или
PostgreSQL през `DATABASE_URL`, когато той е конфигуриран. След промяната
излез и влез отново през същата `/login` форма.

### Stripe test-card flow

1. Отвори `/bg/events`, провери търсене, filters и locale switcher-а към
   `/en/events`.
2. Избери събитие, отвори „Регистрация“ и създай профил с email и парола.
3. В локален режим продължи през автоматично отворената verification страница;
   при конфигуриран Resend отвори линка от получения email. Потвърждението
   създава сесия.
4. Избери категория; приложението резервира един билет и пренасочва към
   Stripe-hosted Checkout.
5. В Stripe sandbox формата използвай test card `4242 4242 4242 4242`,
   произволна бъдеща дата, произволен трицифрен CVC и тестов пощенски код.
   Никога не въвеждай ръчно реална карта. За wallet тест отвори същия Checkout
   на съвместимо устройство/browser с вече настроен Apple Wallet или Google
   Wallet; `sk_test_...` гарантира, че плащането остава в test mode.
6. Провери, че Stripe CLI получава `checkout.session.completed`, success
   страницата води към точно един билет, PDF download-ът работи и ticket
   email-ът е в outbox файла.
7. Повтори webhook event-а и провери, че не се създава втори билет.
8. За неплатена Session провери, че `checkout.session.expired` освобождава
   reservation-а и live наличността се увеличава.
9. Дай admin роля с `npm run user:promote -- <email>`, влез със същия email и
   парола, отвори `/bg/admin` или `/en/admin`, сканирай QR URL и потвърди, че
   втори check-in се отхвърля.

## Environment variables

Виж `.env.example` за пълния template.

| Променлива | Production | Предназначение |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | задължителна | Каноничен HTTPS origin за email и QR линкове. |
| `DATABASE_URL` | production: задължителна, освен при отделни DB полета | PostgreSQL connection string за users, sessions, inventory и queue. |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | алтернатива на `DATABASE_URL` | Отделни PostgreSQL connection полета с безопасно password encoding. |
| `DATABASE_SSL_CA_PATH`, `DATABASE_SSL_CA_BASE64`, `DATABASE_SSL_CA` | AWS RDS: едно е задължително | AWS RDS CA bundle за verified TLS. |
| `DATABASE_POOL_MAX` | не | Shared pool limit; default `5`, максимум `20`. |
| `MIGRATION_DATABASE_URL` | не | Отделен admin/migration connection URL; fallback към normal DB config. |
| `DATABASE_AUTO_MIGRATE` | production: винаги `false` | Development-only runtime DDL escape hatch. |
| `STRIPE_SECRET_KEY` | задължителна | Server-only Stripe secret key; за local/staging използвай test-mode key. |
| `STRIPE_WEBHOOK_SECRET` | production: задължителна; local happy path: не | Отделен server-only signing secret за надеждно асинхронно fulfillment. |
| `RESEND_API_KEY` | задължителна | Resend API credential. |
| `MAIL_FROM` | задължителна | Sender от верифициран домейн. |
| `S3_BUCKET` | задължителна | Private bucket за PDF билетите. |
| `S3_REGION` | задължителна | AWS region или `auto` за R2. |
| `S3_ENDPOINT` | R2: задължителна | R2 endpoint; оставя се празна за AWS S3. |
| `S3_ACCESS_KEY_ID` | задължителна | Object storage access key. |
| `S3_SECRET_ACCESS_KEY` | задължителна | Object storage secret key. |
| `EVENT_DISCOVERY_FEED_URLS` | за discovery: задължителна | JSON array или newline-separated списък с разрешени HTTPS RSS/Atom/ICS/JSON feeds. |
| `EVENT_DISCOVERY_ALLOWED_HOSTS` | не | Exact/wildcard host allowlist за source links извън feed hostname-а. |
| `CRON_SECRET` | за scheduler: задължителна | Стандартният Vercel Cron Bearer secret; минимум 32 random символа. |
| `EVENT_DISCOVERY_CRON_SECRET` | legacy fallback | Използва се само когато `CRON_SECRET` липсва. |
| `EVENT_DISCOVERY_AUTO_PUBLISH` | не | Default `false`; `true` само след review на правата и качеството на всеки feed. |
| `EVENT_DISCOVERY_MAX_EVENTS` | не | Максимални кандидати на run; default `40`, hard cap `500`. |
| `EVENT_DISCOVERY_LOOKAHEAD_DAYS` | не | Бъдещ discovery window; default `180`, hard cap `730`. |
| `GEMINI_API_KEY` | опционална и само при допустим deployment | Server-only enrichment key; празна стойност включва deterministic fallback. |

Нито една secret стойност не трябва да започва с `NEXT_PUBLIC_`, да се commit-ва
в Git или да се споделя в screenshots. Hosted Checkout не използва
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## Routes и API

### Страници

| Route | Предназначение |
| --- | --- |
| `/` | `307` locale detection redirect към `/bg` или `/en`. |
| `/{locale}` | Marketplace landing page; `locale` е `bg` или `en`. |
| `/{locale}/events` | Търсене, filters, sorting и pagination на каталога. |
| `/{locale}/events/[slug]` | Event details, live availability и Stripe Checkout начало. |
| `/{locale}/login` | Единен email/password вход и професионална регистрация за всички роли. |
| `/{locale}/signup` | Пренасочва към registration режима на единния auth portal. |
| `/{locale}/verify` | Потвърждение от потребителя преди активиране на email token-а. |
| `/{locale}/checkout/success` | Server-verified paid-session success и fulfillment fallback. |
| `/{locale}/checkout/cancelled` | Освобождава отказаната reservation и връща към събитието. |
| `/{locale}/account/tickets` | Билетите на текущия потвърден потребител. |
| `/{locale}/tickets/[id]` | Защитен преглед на конкретен билет. |
| `/{locale}/admin` | Защитен order dashboard. |
| `/{locale}/admin/check-in` | Потвърждение и резултат от QR check-in. |
| `/{locale}/admin/discovery` | Feed status, run history и publish/reject review queue. |
| `/{locale}/terms` и `/{locale}/privacy` | Локализирани условия и информация за поверителност. |
| `/sitemap.xml` и `/robots.txt` | Search-engine discovery metadata. |

### Route handlers

| Method и route | Предназначение |
| --- | --- |
| `POST /api/session` | Signup, login, verification resend или logout. |
| `POST /api/verify/start` | JSON compatibility endpoint за нов verification email. |
| `GET /api/verify/confirm` | Compatibility redirect към безопасната confirmation страница; не променя state. |
| `POST /api/verify/confirm` | Консумира еднократен hashed token, потвърждава профила и създава session. |
| `GET /api/event?eventId=...` | Event payload и текуща наличност. |
| `GET /api/events?eventId=...` | Event-scoped SSE availability stream. |
| `POST /api/stripe/checkout` | Създава FIFO reservation и hosted Stripe Checkout Session. |
| `POST /api/stripe/webhook` | Verified, idempotent completion/expiry обработка. |
| `POST /api/stripe/cancel` | Buyer-owned cancellation и незабавно освобождаване на reservation. |
| `POST /api/purchase` | Legacy local route; връща `410` при Stripe config и винаги в production. |
| `GET /api/tickets/[id]/download` | Authorized private PDF download. |
| `GET /api/tickets/[id]/verify` | Насочва admin към check-in confirmation; не променя state. |
| `POST /api/tickets/[id]/verify` | Еднократен, admin-only check-in. |
| `POST /api/admin/session` | Compatibility alias към единния session handler. |
| `GET /api/admin/tickets` | Sanitized ticket list за admin сесия. |
| `POST /api/admin/event-discovery` | Same-origin admin-only ръчно discovery изпълнение. |
| `POST /api/admin/event-discovery/review` | Admin-only publish/reject на pending candidate. |
| `GET` или `POST /api/cron/events/discover` | Bearer-protected Vercel/external scheduler trigger с concurrency lock. |
| `GET /api/health` | Production readiness; връща `200` или `503`. |

## Сигурност

- Паролите се пазят като индивидуално salted `scrypt` hashes; plaintext
  парола никога не се записва.
- Browser-ът получава само cryptographically random opaque session token в
  `HttpOnly`, `SameSite=Lax`, `Secure` production cookie. В базата/JSON се
  пази единствено SHA-256 hash и сесията изтича след 14 дни.
- Verification tokens са random, single-use, валидни 30 минути и също се
  пазят само като SHA-256 hashes.
- Email линкът отваря confirmation екран, а state mutation се извършва само
  след same-origin `POST`, така че автоматичен email preview не активира
  профила.
- Buyer/admin authorization се чете от актуалната role стойност в storage при
  всяка сесия; регистрацията никога не може сама да избере admin роля.
- Credential verification използва constant-time comparison и dummy scrypt
  работа при несъществуващ email, за да намали timing разликите.
- Ticket page и PDF download проверяват buyer ownership или admin role.
- Stripe secret key и webhook secret се четат само от server environment;
  картовите полета са изцяло в Stripe-hosted Checkout.
- Checkout creation проверява buyer session, same-origin заявка и
  server-side event/price/currency данни.
- Webhook-ът валидира raw payload-а със Stripe signature преди mutation.
- Fulfillment проверява paid status, amount, currency, reservation, event и
  ticket category и е защитен с DB locks и unique constraints.
- QR `GET` не извършва mutation; check-in изисква admin `POST`, правилна secret
  стойност и статус `issued`.
- User-controlled SQL values минават през parameterized tagged templates.
- Signup, login, verification, Checkout и cancellation routes имат rate
  limits и state-changing auth routes проверяват same-origin.
- HTML в email-ите се escape-ва, а open redirects се ограничават до локални
  paths.
- CSP, HSTS, frame denial, MIME sniffing protection, referrer и permissions
  headers са конфигурирани глобално.
- Discovery fetch-овете са exact-allowlisted, HTTPS-only, DNS/IP validated,
  manual-redirect, timeout и byte bounded; feed source links имат отделен host
  allowlist.
- Model output минава през strict schema/runtime validation. Gemini никога не
  получава source URLs, contacts, users, prices или inventory и никога не
  управлява директно Stripe или ticket state.
- Cron trigger-ът приема Vercel `GET` и external scheduler `POST` с минимум
  32-знаков Bearer secret, constant-time verification и PostgreSQL advisory
  lock; organizer review е same-origin и role protected.
- Production health/readiness fail closed, ако липсват database, verified
  custom-domain email, storage, Stripe live-mode или webhook настройки, ако
  PostgreSQL TLS не е активен, или ако public URL-ът не е външен HTTPS origin.

Вграденият rate limiter е process-local. При голям multi-instance deployment
трябва да бъде заменен или допълнен с edge/WAF rate limiting или shared Redis
limiter. Това не засяга inventory correctness, която се пази транзакционно от
PostgreSQL.

## Проверки и тестова стратегия

Преди commit или deploy:

```bash
npm run check
npm start
```

В друг terminal:

```bash
curl -i http://localhost:3000/api/health
```

`next build` изпълнява production compilation и TypeScript проверката.
`npm run check` изпълнява ESLint, automated tests и production build с
TypeScript проверка. Production `/api/health` връща `503 degraded`, ако
PostgreSQL/TLS не е достъпен или липсва задължителна public HTTPS URL,
custom-domain Resend sender, S3/R2, Stripe live secret или webhook
конфигурация. Health route-ът не извършва тестово плащане.

За integration/load test използвай отделна staging database, Stripe test mode
и валидна buyer session. Никога не пускай автоматизиран тест срещу live mode.
Acceptance условията са:

- броят активни reservations плюс издадени билети никога не надвишава
  началната наличност;
- всяка успешна заявка има уникален ticket ID и admission label;
- паралелните reservation заявки се обслужват по FIFO position;
- повторен `checkout.session.completed` и race между webhook/success page
  създават точно един билет и една delivery;
- `checkout.session.expired`, failure и cancellation връщат inventory точно
  веднъж;
- SSE клиентите виждат reservation, fulfillment и release промените без
  refresh;
- изоставен queue request или delivery worker не блокира lane-а след lease
  timeout.

За реален release добави automated integration тестове срещу disposable
PostgreSQL и object storage, browser E2E тестове за login/checkout/admin и
периодичен load test със k6 или Artillery. Stripe сценарии се изпълняват само
с test events и test cards.

## Production deploy

Текущият target deployment е:

- **Vercel** — Next.js приложението, custom domain и daily Cron trigger;
- **AWS RDS PostgreSQL** — users, sessions, inventory и durable FIFO queue;
- **Stripe Checkout live mode** — само след merchant onboarding, organizer
  authorization и signed production webhook;
- **Resend** — verification и ticket email от верифициран TicketMe domain;
- **AWS S3 или Cloudflare R2** — private PDF storage.

`npm run build:sites` изгражда минимален 308 redirect към каноничния
`https://www.ticketme.store`, като запазва path-а и query параметрите. Така
private Sites release-ът не създава втори commerce origin със самостоятелни
cookies, webhook-и и payment callbacks. За пълен Cloudflare/OpenNext bundle
използвай `npm run build:cloudflare`.

Стъпки:

1. Свържи GitHub repository-то с Vercel и задай production branch.
2. Осигури restricted network path от runtime-а до RDS. Не отваряй PostgreSQL
   към `0.0.0.0/0`; използвай VPC-reachable runtime или одобрено static egress
   решение и security-group allowlist.
3. Изпълни migrations `001_initial.sql`, `002_stripe_checkout.sql`,
   `003_unified_auth.sql` и `004_event_discovery.sql` чрез
   `npm run db:migrate`.
4. Верифицирай sending domain в Resend.
5. Създай private R2 bucket и API token с object read/write права само за него.
6. За staging създай test webhook, а за production — отделен live webhook
   `https://<domain>/api/stripe/webhook` за `checkout.session.completed`,
   `checkout.session.expired`, `checkout.session.async_payment_succeeded` и
   `checkout.session.async_payment_failed`.
7. Добави правилния environment-specific `STRIPE_SECRET_KEY`, отделния
   endpoint `STRIPE_WEBHOOK_SECRET` и останалите variables от `.env.example`
   във Vercel. Никога не commit-вай стойностите.
8. Използвай `npm run build` за build command и `npm start` за start command,
   deploy-ни и отвори `/api/health`.
9. Регистрирай и потвърди organizer профил, после изпълни
   `npm run user:promote -- organizer@example.com` в среда със същия
   `DATABASE_URL`.
10. Провери двата locale-а и целия acceptance flow с реален email адрес,
   Stripe test card и public staging domain. Не използвай реална карта.
11. Ако използваш discovery, конфигурирай само feeds с право за
    republication, генерирай `CRON_SECRET` и остави конфигурирания daily
    Vercel Cron да извиква `GET /api/cron/events/discover`. Външен scheduler
    може да използва `POST`. Остави auto-publish изключен до source review.

AWS App Runner/ECS, Railway, Render или Fly.io са алтернатива, когато е нужен
директен VPC path или по-дълги SSE връзки. При смяна на runtime-а провери
execution duration, connection pooling и streaming поведението.

Локалните JSON, outbox и filesystem adapters са само за development и не могат
да се активират неволно в production. Публичният каталог може безопасно да
работи source-only, но internal checkout остава затворен, докато конкретно
събитие няма organizer authorization и реален inventory. Live търговията
изисква security и legal review, refund/dispute процеси, данъчно отчитане,
monitoring и оперативна поддръжка.
