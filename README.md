# Tiketko

Tiketko е multi-event платформа за откриване и заявяване на билети с
production-oriented архитектура. Интерфейсът е локализиран на български и
английски и е оптимизиран за desktop и mobile.

Началният snapshot съдържа **126 source listings**: 125 публични записа от
Bilet.bg и едно featured събитие от Eventim, плюс едно изрично first-party
Tiketko събитие. Всеки бъдещ static listing има отделна Tiketko Stripe test
оферта и запазен линк към оригиналния източник. Изтеклите записи автоматично
отпадат от публичния каталог. Към него могат да се добавят публикувани записи
от постоянния discovery каталог в PostgreSQL; новите discovery-only записи
остават source-only, докато не получат изрично конфигурирана оферта.

Snapshot-ът е нормализиран от публичния календар на
[Bilet.bg](https://www.bilet.bg/bg) и публичната страница на
[Deep Purple в Eventim](https://www.eventim.bg/en/artist/deep-purple/).

> [!IMPORTANT]
> Source данните не са Tiketko inventory. За source listings приложението
> показва отделни симулационни цени и наличности, които не са официални данни
> на организатора. Stripe flow-ът работи само с matching `sk_test_` и `pk_test_`
> ключове; генерираният PDF е ясно маркиран „не важи за вход“. Оригиналният
> source link остава видим през целия flow.

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
- Embedded Stripe test Checkout в страницата на Tiketko, само за потребители
  с потвърден имейл. Картовите полета и допустимите Apple Pay/Google Pay wallet
  бутони се рендерират от Stripe; Tiketko никога не получава card данните.
- FIFO reservation преди плащане и idempotent fulfillment след подписан
  Stripe webhook; PDF/storage/email I/O остава извън allocation транзакцията.
- Ticket-category модел с отделен капацитет и цена за first-party admission и
  за ясно означените static test simulations; novel discovery listings са
  source-only.
- Уникален PDF дизайн според събитието и билета, с купувач, категория и QR код
  с безопасна quiet zone. Source simulations имат видим test watermark, нямат
  admission claim и QR кодът проверява само тестовата транзакция.
- Private cloud storage за PDF файловете и защитено изтегляне през сайта.
- PDF attachment и download линк в transactional email след заявката.
- Наличности, FIFO queue depth и активни Checkout-и в реално време чрез
  Server-Sent Events (SSE), без refresh.
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
| Два езика | Locale routing, switcher, localized metadata, UI, checkout, email и PDF съдържание. |
| Email verification | 30-минутен еднократен hashed token; билет може да заяви само потвърден профил. |
| Тестово плащане | Embedded Stripe Checkout с matching `sk_test_`/`pk_test_`, test card и допустими Apple Pay/Google Pay wallet бутони; няма реално таксуване. |
| PDF билет | `pdf-lib` генерира PDF с име, данни за събитието, категория, admission label и QR код. |
| Cloud storage | В production PDF-ите се записват в private Cloudflare R2 или AWS S3 bucket. |
| Email доставка | Resend изпраща PDF attachment и защитен линк за изтегляне. |
| Изтегляне от сайта | Собственикът на билета или администратор може да го изтегли през защитен route. |
| Live наличности | Event-scoped SSE stream изпраща inventory, queue depth и активни Checkout-и към всички отворени клиенти. |
| Честна опашка | PostgreSQL `purchase_queue` подрежда reservation заявките по `BIGSERIAL` позиция за всяка event/category lane. |
| Без oversell | Guarded inventory decrement и reservation insert са в една PostgreSQL транзакция под advisory и row lock. |
| Натоварване | Кратката DB транзакция пази наличността; PDF, storage и email I/O са извън allocation critical section. |
| Добра архитектура | UI, route handlers, domain services и provider adapters са разделени по отговорности. |
| Сигурност | Scrypt password hashes, opaque server-side sessions, authorization, rate limiting, parameterized SQL и security headers. |
| Deploy | Next.js приложението се deploy-ва във Vercel; PostgreSQL, Resend и private S3/R2 остават зад readiness gates. |
| Актуален каталог | Daily/monthly scheduler чете само разрешени feeds, deduplicate-ва записите и ги подава към admin review или доверено auto-publish. |

Бонусите със Stripe Checkout, билетни категории, multi-event каталог,
admin панел и QR верификация също са реализирани. Избор на конкретно
място от карта на зала не е част от тази версия.

## Технологии

- Next.js 16 App Router, React 19 и TypeScript
- Tailwind CSS 4
- PostgreSQL чрез `postgres`
- Node.js `scrypt` за salted password hashing и SHA-256 за opaque tokens
- Stripe Node SDK, Stripe.js и embedded Checkout в test mode
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
  └─ embedded Stripe test checkout
          │
          ▼
Domain services
  ├─ auth + authorization
  ├─ FIFO reservation queue
  ├─ inventory + reservations + tickets
  ├─ licensed-feed discovery + validation + deduplication
  ├─ optional Gemini enrichment ─────► Gemini 3.5 Flash-Lite
  ├─ organizer review / trusted auto-publish
  ├─ signed Stripe webhook fulfillment
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

### Embedded Stripe test payment и ticket fulfillment

1. Потвърденият buyer избира категория и натиска „Плати със Stripe“.
   `POST /api/stripe/checkout` валидира same-origin заявката, сесията,
   `eventId`, категорията и server-side цената.
2. Заявката влиза в постоянната PostgreSQL FIFO lane. Само заявката начело
   може атомарно да намали наличността и да създаде reservation, така че няма
   oversell. Partial unique constraint позволява само една активна reservation
   за buyer/event, включително при retry или няколко отворени tab-а.
3. Сървърът създава embedded Checkout Session с
   `payment_method_types: ["card"]` и връща еднократен `client_secret` само на
   потвърдения buyer. `sk_test_` и `whsec_` остават server-only; `pk_test_` е
   publishable browser ключ от същия Stripe sandbox.
4. Stripe.js монтира provider-owned формата вътре в Tiketko. Stripe рендерира
   card полетата и допустимите Apple Pay/Google Pay бутони според browser,
   устройство, държава и wallet настройка.
5. Подписаният webhook валидира paid status, amount, currency, reservation и
   metadata, след което idempotent transaction създава точно един билет.
   `POST /api/stripe/complete` извършва същата server-side проверка като
   синхронен fallback след `onComplete` на embedded формата.
6. Bounded reconciliation проверява изтеклите attached Sessions чрез Stripe
   API, така че платена сесия се изпълнява, а expired сесия освобождава мястото
   дори без browser return. Stripe остава authoritative за крайния status.
7. Delivery worker генерира QR/PDF, качва го в private object storage и
   изпраща Resend email. Success панелът остава в Tiketko и дава detail,
   download и print actions.

В local JSON режим reservation договорът се сериализира от in-process FIFO
lane и file mutation lock. В production `DATABASE_URL` и Stripe secret key са
задължителни; webhook secret е силно препоръчителен за гарантирано fulfillment.
Старият директен issuer е
изключен с `410`, за да не може плащането да бъде заобиколено.

### Realtime наличности

`GET /api/events?eventId=...` отваря SSE stream за оставащата наличност,
текущата дълбочина на FIFO опашката и активните Checkout reservations. Един
shared channel на application instance обслужва всички локални subscribers за
събитието, изпраща незабавни локални промени и проверява PostgreSQL на всеки
3 секунди за покупки, обработени от други instances. Heartbeat пази връзката
активна, а клиентът използва кратък polling fallback само при прекъснат stream.

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
Migration `005` добавя нормализирана buyer/event uniqueness гаранция за
активните Checkout reservations.

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
   DATABASE_HOST="ticket-db.placeholder.eu-central-1.rds.amazonaws.com"
   DATABASE_PORT="5432"
   DATABASE_NAME="mydb"
   DATABASE_USER="postgres"
   DATABASE_PASSWORD="replace-only-in-env-local"
   DATABASE_SSL_CA_PATH="./global-bundle.pem"
   DATABASE_POOL_MAX="5"
   DATABASE_IDLE_SESSION_TIMEOUT_MS=""
   DATABASE_STATEMENT_TIMEOUT_MS="15000"
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
   `published` бъдещи записи. Новите discovery-only external listings не
   получават автоматично Tiketko inventory или Stripe оферта и водят към
   оригиналния source URL; static test офертите се конфигурират отделно в
   source кода и не се извличат от feed-а.

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

### Payments: embedded Stripe Checkout в test mode

Активният school-project flow използва embedded Stripe Checkout с matching
test secret и publishable key. Tiketko създава Session server-side, а Stripe.js
монтира защитената форма в checkout панела; чувствителните card/wallet данни
никога не преминават през Tiketko сървъра. Card rail-ът позволява Stripe да
покаже Apple Pay или Google Pay, когато browser-ът и wallet-ът са допустими.

При `sk_test_` се използва test mode. За стандартен тест се използва Stripe card
`4242 4242 4242 4242`; това създава тестова Stripe транзакция, не реално
таксуване. Signed webhook-ът е препоръчаният durable fulfillment path; success
return-ът също проверява Session-а server-side и изпълнява idempotent fallback.

Source snapshot-ът съдържа legacy цени в BGN. При нормализиране на каталога те
се конвертират еднократно в EUR по официалния фиксиран курс
`1 EUR = 1.95583 BGN`, закръглени до евроцент. UI, metadata, Stripe amount и
PDF билетите използват една и съща EUR стойност.

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

За embedded test Checkout попълни matching Stripe sandbox ключове:

```dotenv
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

За локален webhook използвай Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

След това стартирай приложението:

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

Card test-ът работи на localhost. Apple Pay/Google Pay изискват допустим
browser, устройство, държава и wallet setup; Stripe решава кой метод да покаже.

Създай профил с име, email и парола. Когато Resend не е конфигуриран,
регистрацията отваря директно страницата за локално потвърждение и ясно
показва, че не е изпратен реален email. Копие остава в `.data/outbox.log`
за debugging. При конфигуриран Resend потребителят получава нормален email
и се връща към login страницата.

### Resend за произволни получатели

`onboarding@resend.dev` е само тестов sender и може да изпраща единствено до
email адреса на собственика на Resend акаунта. Кодът на Tiketko не
ограничава получателите, но реална доставка до Gmail, Outlook, Yahoo или
корпоративен адрес изисква собствен потвърден sending domain:

1. Добави домейн или dedicated subdomain, например `mail.your-domain.com`, в
   Resend Dashboard → Domains.
2. Добави точно генерираните от Resend SPF/MX и DKIM DNS записи при DNS
   доставчика на домейна.
3. Изчакай статус `Verified`.
4. Промени server-only конфигурацията и рестартирай приложението:

   ```dotenv
   MAIL_FROM="Tiketko <tickets@mail.your-domain.com>"
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

### Embedded Stripe test purchase flow

1. Отвори `/bg/events`, провери търсене, filters и locale switcher-а към
   `/en/events`.
2. Избери събитие, отвори „Регистрация“ и създай профил с email и парола.
3. В локален режим продължи през автоматично отворената verification страница;
   при конфигуриран Resend отвори линка от получения email. Потвърждението
   създава сесия.
4. Избери категория и натисни „Плати тестово със Stripe“. Реалната Stripe test
   форма се отваря в Tiketko, без redirect. Използвай
   `4242 4242 4242 4242`, бъдеща дата и произволен CVC.
5. На допустимо устройство провери Apple Pay в Safari 17+ или Google Pay в
   Chrome с настроен wallet. Stripe решава кой wallet button да покаже.
6. Завърши test плащането и провери success страницата, ticket detail
   страницата, PDF download-а, print варианта, ticket email-а и
   live промяната на наличността.
7. Повтори flow-а за различни категории и провери, че всяка paid заявка
   получава уникален билет. Source simulations трябва да имат test transaction
   label и „не важи за вход“, а first-party билетът — admission label.
8. Дай admin роля с `npm run user:promote -- <email>`, влез със същия email и
   парола, отвори `/bg/admin` или `/en/admin`, сканирай QR URL и потвърди, че
   втори check-in се отхвърля.

## Environment variables

Виж `.env.example` за пълния template.

| Променлива | Production | Предназначение |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | задължителна | Каноничен HTTPS origin за email и QR линкове; в production използвай точно `https://www.tiketko.top`. |
| `DATABASE_URL` | production: задължителна, освен при отделни DB полета | PostgreSQL connection string за users, sessions, inventory и queue. |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | алтернатива на `DATABASE_URL` | Отделни PostgreSQL connection полета с безопасно password encoding. |
| `DATABASE_SSL_CA_PATH`, `DATABASE_SSL_CA_BASE64`, `DATABASE_SSL_CA` | AWS RDS: едно е задължително | AWS RDS CA bundle за verified TLS. |
| `DATABASE_POOL_MAX` | не | Shared pool limit; default `5`, максимум `20`. Във Vercel runtime ефективният лимит е `1` на instance, за да не се изчерпва RDS connection budget при scale-out. |
| `DATABASE_IDLE_SESSION_TIMEOUT_MS` | не | PostgreSQL server-side idle timeout; във Vercel default `5000` ms, извън Vercel default `0`. Допустими са `0` или `5000`–`60000` ms. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | не | Runtime SQL timeout; default `15000`, допустими `1000`–`60000` ms. |
| `MIGRATION_DATABASE_URL` | не | Отделен admin/migration connection URL; fallback към normal DB config. |
| `MIGRATION_STATEMENT_TIMEOUT_MS` | не | Timeout само за migration CLI; default `60000` ms. |
| `DATABASE_AUTO_MIGRATE` | production: винаги `false` | Development-only runtime DDL escape hatch. |
| `STRIPE_SECRET_KEY` | задължителна | Server-only `sk_test_` за тестово или `sk_live_` за изрично разрешено live Stripe Checkout. |
| `STRIPE_PUBLISHABLE_KEY` | задължителна | Matching `pk_test_`/`pk_live_` ключ за Stripe.js; безопасен е за browser, но се подава server-side само при съвпадащ mode. |
| `STRIPE_WEBHOOK_SECRET` | силно препоръчителна | Endpoint `whsec_` signing secret за durable fulfillment и expired-session cleanup. |
| `RESEND_API_KEY` | задължителна | Resend API credential. |
| `MAIL_FROM` | задължителна | Sender от верифициран домейн. |
| `S3_BUCKET` | задължителна | Private bucket за PDF билетите. |
| `S3_REGION` | задължителна | AWS region или `auto` за R2. |
| `S3_ENDPOINT` | R2: задължителна | R2 endpoint; оставя се празна за AWS S3. |
| `S3_ACCESS_KEY_ID` | задължителна | Object storage access key. |
| `S3_SECRET_ACCESS_KEY` | задължителна | Object storage secret key. |
| `EVENT_DISCOVERY_FEED_URLS` | за discovery: задължителна | JSON array или newline-separated списък с разрешени HTTPS RSS/Atom/ICS/JSON feeds. |
| `EVENT_DISCOVERY_ALLOWED_HOSTS` | не | Exact/wildcard host allowlist за source links извън feed hostname-а. |
| `CRON_SECRET` | за scheduler: задължителна | Стандартният Vercel Cron Bearer secret за discovery и retry на ticket delivery; минимум 32 random символа. |
| `EVENT_DISCOVERY_CRON_SECRET` | legacy fallback | Използва се само когато `CRON_SECRET` липсва. |
| `EVENT_DISCOVERY_AUTO_PUBLISH` | не | Default `false`; `true` само след review на правата и качеството на всеки feed. |
| `EVENT_DISCOVERY_MAX_EVENTS` | не | Максимални кандидати на run; default `40`, hard cap `500`. |
| `EVENT_DISCOVERY_LOOKAHEAD_DAYS` | не | Бъдещ discovery window; default `180`, hard cap `730`. |
| `GEMINI_API_KEY` | опционална и само при допустим deployment | Server-only enrichment key; празна стойност включва deterministic fallback. |

Secret стойностите не трябва да започват с `NEXT_PUBLIC_`, да се commit-ват в
Git или да се споделят в screenshots. `sk_test_`, `sk_live_` и `whsec_` никога
не се изпращат към browser-а.

## Routes и API

### Страници

| Route | Предназначение |
| --- | --- |
| `/` | `307` locale detection redirect към `/bg` или `/en`. |
| `/{locale}` | Marketplace landing page; `locale` е `bg` или `en`. |
| `/{locale}/events` | Търсене, filters, sorting и pagination на каталога. |
| `/{locale}/events/[slug]` | Event details, live availability, source attribution и embedded Stripe test purchase. |
| `/{locale}/login` | Единен email/password вход и професионална регистрация за всички роли. |
| `/{locale}/signup` | Пренасочва към registration режима на единния auth portal. |
| `/{locale}/verify` | Потвърждение от потребителя преди активиране на email token-а. |
| `/{locale}/checkout/success` | Server-verified Stripe confirmation fallback и ticket fulfillment status. |
| `/{locale}/checkout/cancelled` | Compatibility cancellation страница за изоставена reservation. |
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
| `GET /api/event?eventId=...` | Event payload, текуща наличност и purchase activity. |
| `GET /api/events?eventId=...` | Event-scoped SSE stream за inventory, queue и активни покупки. |
| `POST /api/purchase` | Retired direct issuer; връща `410`, за да не може Stripe да бъде заобиколен. |
| `POST /api/stripe/checkout` | FIFO reservation и embedded Stripe Checkout `client_secret`. |
| `POST /api/stripe/complete` | Buyer-owned server verification, idempotent PDF/storage/email fulfillment и protected ticket links. |
| `POST /api/stripe/webhook` | Signature-verified, idempotent completion/expiry обработка. |
| `POST /api/stripe/cancel` | Buyer-owned cancellation и безопасно освобождаване на reservation. |
| `GET /api/tickets/[id]/download` | Authorized private PDF download; `?print=1` отваря inline print вариант. |
| `GET /api/tickets/[id]/verify` | Насочва admin към check-in confirmation; не променя state. |
| `POST /api/tickets/[id]/verify` | Еднократен, admin-only check-in. |
| `POST /api/admin/session` | Compatibility alias към единния session handler. |
| `GET /api/admin/tickets` | Sanitized ticket list за admin сесия. |
| `POST /api/admin/event-discovery` | Same-origin admin-only ръчно discovery изпълнение. |
| `POST /api/admin/event-discovery/review` | Admin-only publish/reject на pending candidate. |
| `GET` или `POST /api/cron/events/discover` | Bearer-protected Vercel/external scheduler trigger с concurrency lock. |
| `GET` или `POST /api/cron/tickets/deliver` | Bearer-protected retry на pending PDF storage и email delivery. |
| `GET /api/health` | Production readiness; връща `200` или `503`. |

## Сигурност

Подробният operational hardening, incident-response и 300-user load-test
runbook е в [docs/SECURITY_GUIDE.md](docs/SECURITY_GUIDE.md).

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
- Embedded Stripe Checkout обработва card/wallet полетата в provider-owned
  iframe вътре в Tiketko; приложението не получава PAN, CVC или wallet
  credentials.
- Checkout creation изисква потвърдена buyer session, same-origin заявка,
  валиден server-only Stripe key и server-side event/category/amount validation.
- FIFO reservation и inventory update са защитени с PostgreSQL
  transaction/locks; един buyer не може да държи паралелно няколко места за
  едно събитие.
- След attach Stripe е authoritative за expiry: локалният часовник освобождава
  само още-неприкачени reservations, а Checkout място се връща след подписан
  `checkout.session.expired` event, потвърдено server-side cancel/expire или
  bounded Stripe API reconciliation.
- Webhook route-ът чете raw body, валидира Stripe signature и използва unique
  constraints плюс delivery claim lease за idempotent fulfillment.
- QR `GET` не извършва mutation; check-in изисква admin `POST`, правилна secret
  стойност и статус `issued`.
- User-controlled SQL values минават през parameterized tagged templates.
- Signup, login, verification, purchase, Checkout и cancellation routes имат rate
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
  custom-domain email, storage, public HTTPS URL или валиден Stripe secret key,
  или ако PostgreSQL TLS не е активен. Webhook наличността се отчита отделно.

В production rate limiter-ът използва атомарни shared PostgreSQL buckets с
hashed identity keys и fail-closed поведение; local development пази bounded
in-process buckets. Edge/WAF rules остават необходим втори слой срещу volumetric
abuse. Inventory correctness се пази отделно и транзакционно от PostgreSQL.

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
TypeScript проверка. Production `/api/health` връща само `ready` или `degraded`
и съответно HTTP `200`/`503`; подробности за database, TLS, storage, email и
Stripe не се разкриват публично. Readiness probe-ът е coalesced и кеширан за 30
секунди на instance и не извършва тестово плащане.

За integration/load test използвай отделна staging database, Stripe sandbox и
валидна buyer session. Acceptance условията са:

- броят издадени билети никога не надвишава началната наличност;
- всяка успешна заявка има уникален ticket ID и admission label;
- паралелните Checkout reservation заявки се обслужват по FIFO position;
- retry/няколко tab-а на един buyer държат най-много една активна reservation
  за събитието;
- duplicate webhook/completion callbacks създават точно един билет;
- cancellation и expired sessions връщат inventory точно веднъж;
- SSE клиентите виждат reservation, fulfillment и inventory промените без refresh;
- изоставен queue request или delivery worker не блокира lane-а след lease
  timeout.

За реален release добави automated integration тестове срещу disposable
PostgreSQL и object storage, browser E2E тестове за login/checkout/admin и
периодичен load test със k6 или Artillery. Stripe сценарии се изпълняват само
с test events, test keys и test cards.

## Production deploy

Текущият target deployment е:

- **Vercel** — Next.js приложението, custom domain и daily Cron trigger;
- **AWS RDS PostgreSQL** — users, sessions, inventory и durable FIFO queue;
- **Embedded Stripe Checkout test mode** — active in-site test payment flow;
- **Resend** — verification и ticket email от верифициран Tiketko domain;
- **AWS S3 или Cloudflare R2** — private PDF storage.

`npm run build:sites` изгражда минимален 308 redirect към каноничния
`https://www.tiketko.top`, като запазва path-а и query параметрите. Така
private Sites release-ът не създава втори commerce origin със самостоятелни
cookies, webhook-и и payment callbacks. За пълен Cloudflare/OpenNext bundle
използвай `npm run build:cloudflare`.

Стъпки:

1. Свържи GitHub repository-то с Vercel и задай production branch.
2. Осигури restricted network path от runtime-а до RDS. Не отваряй PostgreSQL
   към `0.0.0.0/0`; използвай VPC-reachable runtime или одобрено static egress
   решение и security-group allowlist.
3. Изпълни migrations `001_initial.sql`, `002_stripe_checkout.sql`,
   `003_unified_auth.sql`, `004_event_discovery.sql` и
   `005_checkout_fairness.sql` чрез
   `npm run db:migrate`.
4. Верифицирай sending domain в Resend.
5. Създай private R2 bucket и API token с object read/write права само за него.
6. Добави задължителните database, email, storage, public URL и matching Stripe
   `sk_test_`/`pk_test_` variables от `.env.example` във
   Vercel. Никога не commit-вай secret стойностите.
7. Добави Stripe webhook endpoint към `/api/stripe/webhook`, запиши `whsec_`
   secret-а и активирай желаните wallets в test Payment Methods настройките.
8. Използвай `npm run build` за build command и `npm start` за start command,
   deploy-ни и отвори `/api/health`.
9. Регистрирай и потвърди organizer профил, после изпълни
   `npm run user:promote -- organizer@example.com` в среда със същия
   `DATABASE_URL`.
10. Провери двата locale-а и целия acceptance flow с реален email адрес,
   Stripe test card и public staging domain. Не използвай live keys.
11. Генерирай `CRON_SECRET`; Vercel Cron използва същия Bearer secret за daily
    recovery на ticket delivery и за daily event discovery. Signed Stripe
    webhook-ът остава immediate delivery path. Ако използваш discovery,
    конфигурирай само feeds с право за republication и остави auto-publish
    изключен до source review. Външен scheduler може да използва `POST` за
    по-чест recovery на двата route-а.

AWS App Runner/ECS, Railway, Render или Fly.io са алтернатива, когато е нужен
директен VPC path или по-дълги SSE връзки. При смяна на runtime-а провери
execution duration, connection pooling и streaming поведението.

Локалните JSON, outbox и filesystem adapters са само за development и не могат
да се активират неволно в production. Публичният каталог може безопасно да
работи source-only. Static source listings могат да имат само ясно означена
Stripe test simulation; реален admission checkout остава затворен, докато
конкретно събитие няма organizer authorization и реален inventory. Live
търговията изисква security и legal review, refund/dispute процеси, данъчно
отчитане, monitoring и оперативна поддръжка.
