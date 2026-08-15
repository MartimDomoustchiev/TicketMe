# Практическо ръководство за сигурност

Този документ е оперативен наръчник за публичното GitHub repository и
production инсталацията на приложението. Той не съдържа истински имена на
ресурси, account IDs, endpoints, ключове или пароли. Стойности като
`<APP_DATABASE>`, `<PRODUCTION_DOMAIN>` и `<TICKET_BUCKET>` са placeholders и
трябва да бъдат заменени само в защитен dashboard или локален secret manager —
никога в Git, issue, pull request, screenshot или chat.

## 1. Какво защитаваме

### Критични активи

- пароли като еднопосочни hashes, session hashes и email-verification tokens;
- имена и email адреси на купувачите;
- наличности, FIFO позиции, Checkout reservations и връзката им със Stripe;
- PDF билетите, техните QR secrets и storage keys;
- Stripe secret/webhook keys, Resend key, S3 credentials и database пароли;
- audit trail, deployment logs, backups и GitHub/Vercel/AWS акаунтите.

Stripe Elements/Embedded Checkout трябва да събира картовите данни директно.
Сървърът не трябва да получава, записва или логва пълен номер на карта, CVC или
Apple Pay/Google Pay payment token.

### Trust boundaries

```text
Browser
  -> Vercel / Next.js routes
       -> PostgreSQL / RDS (users, queue, reservations, tickets)
       -> Stripe (payment state and signed webhooks)
       -> S3-compatible private storage (PDF)
       -> Resend (verification and ticket email)

GitHub Actions -> build/test only; production secrets are not required
Operator -> GitHub, Vercel, AWS, Stripe and Resend dashboards with MFA
```

### Основни заплахи

- конкурентни покупки, overselling или заобикаляне на FIFO реда;
- forged/replayed Stripe webhook или fulfillment на неплатена сесия;
- account takeover, session theft, email/token enumeration и admin escalation;
- достъп до чужд PDF/QR, повторно използване или подмяна на билет;
- изтичане на secret през Git history, Actions logs, Vercel logs или preview;
- DDoS/abuse на login, verification, checkout, SSE и database health routes;
- изчерпване на RDS connections или locks при serverless burst;
- компрометиран npm package, GitHub Action или operator account;
- грешна среда: live Stripe key с preview база или production email към тестови
  потребители.

## 2. Минимален security baseline

Преди production продажба трябва едновременно да са изпълнени следните
условия:

1. RDS не приема `0.0.0.0/0` или `::/0` на TCP `5432`.
2. Runtime database role няма DDL, role-management или superuser права.
3. Production, Preview и Development имат отделни secrets и отделни данни.
4. Stripe webhook signature се проверява със secret от същата среда и режим.
5. S3 bucket е private и runtime credential има достъп само до `tickets/*`.
6. Distributed rate limiter и edge/WAF ограничения пазят скъпите routes.
7. GitHub `main` е защитен с ruleset и задължителни CI/CodeQL checks.
8. Backups, monitoring и възстановяване са проверени, не само включени.
9. `npm run check` и `npm audit --audit-level=high` минават от чист checkout.
10. Тестът за конкурентни 300 потребители доказва нулево overselling и нулеви
    дублирани билети.

## 3. GitHub: настройки за публично repository

### 3.1 Достъп и автентикация

В организацията или личния GitHub account:

1. Отвори **Settings -> Password and authentication** и включи 2FA.
2. Предпочети passkey или hardware security key; запази recovery codes offline.
3. В **Settings -> Applications** премахни неизползваните OAuth/GitHub Apps.
4. В **Developer settings -> Personal access tokens** премахни classic tokens;
   използвай fine-grained token с кратък срок и само необходимото repository.
5. Не споделяй account. Всеки maintainer трябва да има собствен identity и
   минимална роля.

### 3.2 Code security

В repository отвори **Settings -> Security -> Code security** (името може да е
**Code security and analysis**):

- включи **Dependabot alerts**;
- включи **Dependabot security updates**;
- включи **Secret scanning** и **Push protection**, ако са достъпни за repo-то;
- включи **Validity checks** за намерените secrets, ако GitHub ги предлага;
- разреши CodeQL/SARIF uploads и провери, че workflow-ът `CodeQL` има резултат;
- включи **Private vulnerability reporting**.

След включването провери **Security -> Dependabot**, **Security -> Code
scanning** и **Security -> Secret scanning**. „Enabled“ без поне един успешно
завършил workflow не е достатъчно доказателство.

### 3.3 Ruleset за `main`

Отвори **Settings -> Rules -> Rulesets -> New ruleset -> New branch ruleset**:

1. Име: `protect-main`; enforcement: **Active**.
2. Target branches: включи само default branch `main`.
3. Разреши bypass само на един emergency owner; не давай bypass на всички
   maintainers.
4. Включи:
   - **Restrict deletions**;
   - **Block force pushes**;
   - **Require a pull request before merging**;
   - поне 1 approval за промени по auth, payment, database и deployment, когато
     има втори доверен maintainer;
   - **Dismiss stale approvals** и **Require conversation resolution**;
   - **Require status checks to pass**;
   - **Require branches to be up to date** преди merge.
5. След първото изпълнение на workflows избери реалните check names от UI:
   `validate` от CI и JavaScript/TypeScript анализа от CodeQL.
6. По желание включи linear history и signed commits, но първо провери, че
   всички maintainers могат да подписват commits без да заобикалят ruleset-а.

При solo repository остави required approvals на `0`, но запази изискването за
pull request и успешни checks. Авторът не може да одобри собствения си pull
request и стойност `1` би блокирала проекта без втори доверен maintainer. След
добавянето на такъв maintainer увеличи изискването на поне `1`.

Ако Rulesets не са достъпни, използвай **Settings -> Branches -> Branch
protection rules** със същите ограничения.

### 3.4 Actions и публични данни

В **Settings -> Actions -> General**:

- default workflow permissions: **Read repository contents**;
- не разрешавай Actions автоматично да одобряват pull requests;
- ограничи Actions до GitHub-owned/verified actions или allowlist;
- за по-силен supply-chain контрол pin-ни third-party actions до commit SHA;
- не използвай production environment secrets в CI build/test job;
- не стартирай workflow от untrusted fork с production secrets.

Никога не публикувай като artifact `.env*`, database dump, Vercel output,
coverage с customer fixtures, PDF билети или application logs. Issues и PR-и
също са публични. Vulnerability reports се подават по процедурата в
`SECURITY.md`, не като issue.

## 4. Secrets и ротация

### 4.1 Правила

- Secret никога не започва с `NEXT_PUBLIC_`. Изключения са само публични
  стойности като Stripe publishable key и публичният application origin.
- Един secret има отделна стойност за Production, Preview и Development.
- Ключовете се създават с минимален scope и се сменят периодично и при всяко
  съмнение за изтичане.
- Първо се прекратява достъпът/ротира ключът, после се чистят docs/logs/history.
  Изтриване от последния commit не обезсилва вече изтекъл credential.
- Не paste-вай secret в terminal command, който остава в shell history. Използвай
  provider dashboard, password prompt или защитен secret manager.

### 4.2 Безопасна последователност за ротация

1. Ограничи атакуемата повърхност: затвори security-group rule, pause-ни
   checkout или защити deployment-а, ако е необходимо.
2. Създай нов credential с минимални права; не изтривай стария още.
3. Запиши новия credential само в правилния Vercel environment.
4. Redeploy-ни и направи smoke test.
5. Revокирай стария credential.
6. Провери provider audit logs за употреба след revocation.
7. Документирай кога, защо и от кого е направена ротацията, без secret value.

### 4.3 Какво се ротира

- **RDS:** runtime и migration паролите отделно. Ако endpoint е бил публично
  описан, първо провери network exposure, после смени паролите и прегледай DB
  logs. Runtime не трябва да използва master user.
- **Stripe:** secret key и webhook signing secret са различни credentials.
  Създай нов webhook secret/endpoint, deploy-ни, тествай signed event и чак
  тогава премахни стария endpoint/key. Не смесвай `test` и `live` keys.
- **Resend:** създай нов send-only key, deploy-ни, изпрати до контролиран адрес,
  после revoke-ни стария.
- **S3:** създай нов scoped access key, deploy-ни, тествай put/get само под
  `tickets/`, после деактивирай и изтрий стария.
- **Cron/Gemini:** смени `CRON_SECRET`, legacy scheduler secret и API key; провери
  дали старите scheduled clients са спрени.
- **Sessions:** при account/DB compromise изтрий активните `auth_sessions`, за да
  изискаш нов login. Token values не трябва да се логват.

## 5. Vercel: изолация на среди

В **Project -> Settings -> Environment Variables** прегледай всяка променлива
поотделно и избери точния scope.

| Environment | Database | Stripe | Email | Storage | Public URL |
| --- | --- | --- | --- | --- | --- |
| Production | production DB/runtime role | live само при одобрено пускане; иначе test | verified production domain | production private bucket/prefix | `https://<PRODUCTION_DOMAIN>` |
| Preview | отделна staging DB | test account/keys | sandbox или allowlisted recipient | отделен bucket/prefix | preview origin или стабилен staging origin |
| Development | локална/изолирана DB | Stripe CLI/test | local outbox/test key | local/test bucket | localhost |

Практически стъпки:

1. Премахни Production scope от всички Preview credentials.
2. `DATABASE_URL` използва runtime role; само контролирана migration job/локална
   admin машина получава `MIGRATION_DATABASE_URL`.
3. `DATABASE_AUTO_MIGRATE=false` в Production.
4. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, database
   паролите и S3 secret никога не са Preview secrets от production.
5. След env промяна направи нов deployment; стар deployment може да продължи да
   използва стар snapshot на environment-а до redeploy.
6. В **Settings -> Deployment Protection** защити Preview deployments, когато
   показват реалистични потребителски данни.
7. В **Settings -> Functions** избери region близо до RDS. Cross-region latency
   удължава transactions и lock wait при пик.
8. В **Settings -> Domains** избери един canonical hostname и redirect-ни другите
   към него, запазвайки path/query. Регистрирай canonical domain в Stripe payment
   method domains.
9. Дай Vercel project access само на необходимите хора и включи MFA/SSO според
   плана. Преглеждай activity/audit log.
10. Не логвай цял `process.env`, request headers, cookies, webhook payloads,
    verification URLs или PDF contents.

`vercel env pull` създава локален файл със secrets. Той трябва да остане ignored,
с file mode само за локалния user и да бъде изтрит от споделени машини.

## 6. AWS RDS PostgreSQL

### 6.1 Network архитектура

Предпочитана production схема:

```text
Vercel/AWS application with controlled egress
  -> private RDS Proxy endpoint (TLS required)
       -> private RDS PostgreSQL
```

- RDS: **Publicly accessible = No**.
- DB security group inbound: TCP `5432` само от application/proxy security
  group, не от internet CIDR.
- RDS и Proxy са в private subnets; route tables не дават директен public path.
- RDS Proxy не прави public RDS безопасен сам по себе си. Клиентът пак трябва да
  има частен network path или контролиран egress до Proxy.
- При Vercel без private connectivity/static egress не отваряй RDS към целия
  internet. Използвай Vercel Secure Compute/static egress, AWS application tier
  с security-group identity, или друг server-side pooler с удостоверен TLS вход.
- Временно `/32` правило е допустимо само за конкретна admin машина и се маха
  веднага след migration. То не е решение за динамичен serverless egress.
- В parameter group включи принудителен TLS (`rds.force_ssl`) и използвай AWS CA
  bundle с hostname verification.

### 6.2 RDS Proxy и connections

- Proxy endpoint и RDS трябва да са в една VPC или валидно свързани мрежи.
- **Require TLS** е включено.
- DB credentials се пазят в AWS Secrets Manager; не hardcode-вай ги в proxy
  config или repository.
- Настрой pool limits след измерване на `DatabaseConnections`, latency и
  transaction pinning. Не допускай Proxy да отвори почти всички DB connections.
- Приложението използва transactions за queue/reservations. Тествай RDS Proxy с
  реалните конкурентни сценарии; не приемай, че всяка connection се multiplex-ва.
- Докато няма server-side pooler, запази минимален connection pool на всяка
  Vercel instance и следи общия сбор при scale-out.

### 6.3 Отделни migration и runtime роли

Следващият SQL е template. Изпълнява се от RDS admin/текущия object owner в
`<APP_DATABASE>`. Паролите се задават през защитен prompt или secret manager, не
се записват в този файл.

```sql
-- Изпълни веднъж като RDS admin.
CREATE ROLE "<APP_RUNTIME_ROLE>"
  LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;

CREATE ROLE "<APP_MIGRATION_ROLE>"
  LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;

-- Само в interactive psql: командите питат за паролата без cleartext SQL.
\password "<APP_RUNTIME_ROLE>"
\password "<APP_MIGRATION_ROLE>"

REVOKE ALL ON DATABASE "<APP_DATABASE>" FROM PUBLIC;
GRANT CONNECT ON DATABASE "<APP_DATABASE>"
  TO "<APP_RUNTIME_ROLE>", "<APP_MIGRATION_ROLE>";

-- Оттук нататък се свържи към <APP_DATABASE>.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM "<APP_RUNTIME_ROLE>";
GRANT USAGE ON SCHEMA public TO "<APP_RUNTIME_ROLE>";
GRANT USAGE, CREATE ON SCHEMA public TO "<APP_MIGRATION_ROLE>";

-- STOP: изпълни migrations чрез MIGRATION_DATABASE_URL, свържи се отново
-- като admin/owner и чак тогава изпълни object grants по-долу.

-- Runtime започва без наследени object permissions.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "<APP_RUNTIME_ROLE>";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "<APP_RUNTIME_ROLE>";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM "<APP_RUNTIME_ROLE>";

-- Четене на колоните, използвани от SELECT/WHERE/RETURNING/ON CONFLICT.
GRANT SELECT ON TABLE
  public.event_inventory,
  public.verification_tokens,
  public.tickets,
  public.purchase_queue,
  public.checkout_reservations,
  public.users,
  public.auth_sessions,
  public.email_verification_tokens,
  public.catalog_events,
  public.catalog_event_sources,
  public.event_discovery_runs,
  public.request_rate_limits
TO "<APP_RUNTIME_ROLE>";

GRANT INSERT ON TABLE
  public.event_inventory,
  public.verification_tokens,
  public.tickets,
  public.purchase_queue,
  public.checkout_reservations,
  public.audit_log,
  public.users,
  public.auth_sessions,
  public.email_verification_tokens,
  public.catalog_events,
  public.catalog_event_sources,
  public.event_discovery_runs,
  public.request_rate_limits
TO "<APP_RUNTIME_ROLE>";

GRANT UPDATE ON TABLE
  public.event_inventory,
  public.tickets,
  public.checkout_reservations,
  public.users,
  public.catalog_events,
  public.catalog_event_sources,
  public.event_discovery_runs,
  public.request_rate_limits
TO "<APP_RUNTIME_ROLE>";

-- SELECT ... FOR UPDATE изисква UPDATE върху поне една колона. Използвай
-- неидентифицираща operational колона вместо table-wide UPDATE.
REVOKE UPDATE ON TABLE public.purchase_queue FROM "<APP_RUNTIME_ROLE>";
GRANT UPDATE (enqueued_at) ON TABLE public.purchase_queue
TO "<APP_RUNTIME_ROLE>";

GRANT DELETE ON TABLE
  public.verification_tokens,
  public.tickets,
  public.purchase_queue,
  public.auth_sessions,
  public.email_verification_tokens,
  public.request_rate_limits
TO "<APP_RUNTIME_ROLE>";

-- BIGSERIAL defaults, необходими за INSERT без ръчно зададен id/position.
GRANT USAGE ON SEQUENCE
  public.purchase_queue_position_seq,
  public.catalog_event_sources_id_seq
TO "<APP_RUNTIME_ROLE>";

-- Runtime няма достъп до migration ledger-а.
REVOKE ALL ON TABLE public.schema_migrations FROM "<APP_RUNTIME_ROLE>";

-- Defense in depth, същите граници като приложението.
ALTER ROLE "<APP_RUNTIME_ROLE>" SET statement_timeout = '15s';
ALTER ROLE "<APP_RUNTIME_ROLE>" SET lock_timeout = '5s';
ALTER ROLE "<APP_RUNTIME_ROLE>"
  SET idle_in_transaction_session_timeout = '15s';
```

Не давай на runtime `CREATE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, ownership,
`BYPASSRLS`, `rds_superuser` или права върху други schemas/databases.

Ако таблиците вече са създадени от master user, следваща migration с `ALTER`
може да изисква ownership. Като текущ owner прехвърли само application objects
към migration role или продължи migrations с отделен owner role. Не използвай
широко `REASSIGN OWNED`, ако старият owner притежава несвързани обекти.

### 6.4 Нови migrations и default privileges

`MIGRATION_DATABASE_URL` трябва винаги да сочи към `<APP_MIGRATION_ROLE>`, а
`DATABASE_URL` — към `<APP_RUNTIME_ROLE>`. Runtime migration остава изключена.

Изпълни следващите defaults като migration role. Те fail-ват затворено: бъдещ
обект не става достъпен за `PUBLIC` или runtime автоматично.

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "<APP_MIGRATION_ROLE>"
  IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "<APP_MIGRATION_ROLE>"
  IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "<APP_MIGRATION_ROLE>"
  IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Всяка нова migration трябва изрично да даде само нужните runtime права. Пример:

```sql
CREATE TABLE public.<NEW_RUNTIME_TABLE> (...);
GRANT SELECT, INSERT ON TABLE public.<NEW_RUNTIME_TABLE>
  TO "<APP_RUNTIME_ROLE>";

-- Само ако таблицата има identity/serial sequence, използвана от runtime:
GRANT USAGE ON SEQUENCE public.<NEW_RUNTIME_SEQUENCE>
  TO "<APP_RUNTIME_ROLE>";
```

След `npm run db:migrate` провери като runtime role:

```sql
SELECT
  current_user,
  has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
  has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
  has_table_privilege(
    current_user, 'public.request_rate_limits', 'SELECT'
  )
    AND has_table_privilege(
      current_user, 'public.request_rate_limits', 'INSERT'
    )
    AND has_table_privilege(
      current_user, 'public.request_rate_limits', 'UPDATE'
    )
    AND has_table_privilege(
      current_user, 'public.request_rate_limits', 'DELETE'
    ) AS rate_limit_dml,
  has_table_privilege(current_user, 'public.purchase_queue', 'SELECT')
    AND has_table_privilege(
      current_user, 'public.purchase_queue', 'INSERT'
    )
    AND has_table_privilege(
      current_user, 'public.purchase_queue', 'DELETE'
    ) AS queue_dml,
  has_column_privilege(
    current_user,
    'public.purchase_queue',
    'enqueued_at',
    'UPDATE'
  ) AS queue_lock_update,
  has_sequence_privilege(
    current_user,
    'public.purchase_queue_position_seq',
    'USAGE'
  ) AS queue_sequence_usage,
  has_sequence_privilege(
    current_user,
    'public.catalog_event_sources_id_seq',
    'USAGE'
  ) AS catalog_source_sequence_usage;
```

Очаквано: `schema_usage=true`, `schema_create=false`, останалите показани runtime
права `true`. Добави regression check за всяка бъдеща таблица/sequence.

`purchase_queue` изисква `UPDATE`, въпреки че приложението не изпълнява директен
`UPDATE` върху таблицата: PostgreSQL изисква това право за използвания
`SELECT ... FOR UPDATE`. След промяна на ролите изпълни и zero-row smoke test,
който проверява ACL без да заключва или променя редове:

```sql
BEGIN;
SET LOCAL ROLE "<APP_RUNTIME_ROLE>";
SELECT request_id
FROM public.purchase_queue
WHERE FALSE
FOR UPDATE;
ROLLBACK;
```

### 6.5 Backups, encryption и monitoring

В RDS dashboard:

- encryption at rest е включено с управляван KMS key;
- automated backups/PITR са включени с поне 7–14 дни retention според бюджета;
- deletion protection е включено;
- production deletion изисква final snapshot;
- backup window и maintenance window не съвпадат с началото на продажба;
- automatic minor upgrades се планират и първо се тестват в staging;
- PostgreSQL log exports, Performance Insights и Enhanced Monitoring са включени
  според бюджета;
- CloudWatch alarms има поне за CPU, free memory, free storage,
  `DatabaseConnections`, read/write latency, replica lag (ако има replica) и
  failed connections/errors.

На всеки release с migration направи snapshot преди DDL. Поне веднъж на
тримесечие възстанови backup в изолирана staging instance, изпълни schema check и
smoke checkout. Backup без доказан restore не се счита за работещ backup.

## 7. Private S3 storage за PDF билети

Bucket настройките трябва да имат:

- **Block all public access**;
- Object Ownership: bucket-owner enforced;
- default encryption (SSE-S3 или SSE-KMS);
- versioning и lifecycle според retention политиката;
- без static website hosting и без public CORS;
- отделен bucket или поне отделен credential за всяка среда.

Текущият server-side adapter използва само `GetObject` и `PutObject` под
`tickets/`. Следната identity policy е достатъчна за AWS S3 и не разрешава list,
delete, ACL или достъп извън prefix-а:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadWriteTicketPdfPrefixOnly",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::<TICKET_BUCKET>/tickets/*"
    }
  ]
}
```

Bucket policy за задължителен TLS:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::<TICKET_BUCKET>",
        "arn:aws:s3:::<TICKET_BUCKET>/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

При customer-managed KMS key добави само необходимите `kms:Encrypt`,
`kms:Decrypt` и `kms:GenerateDataKey` права, ограничени до конкретния key и S3
encryption context. Не връщай директен public S3 URL; download route трябва да
проверява session ownership/admin authorization преди server-side `GetObject`.

## 8. Stripe

### Environment и keys

- Докато проектът е учебен, Production може да използва Stripe test mode, но
  UI трябва ясно да казва, че няма реално таксуване.
- Secret и publishable key винаги са от един account и един режим.
- Preview/Development използват отделни test keys/webhook endpoints.
- Live mode се включва само след писмен release decision, legal/business review,
  refund/support процедура и успешен end-to-end test.

### Webhook dashboard

В Stripe **Developers/Workbench -> Webhooks -> Add endpoint**:

1. URL: `https://<PRODUCTION_DOMAIN>/api/stripe/webhook`.
2. Избери само събитията, които route-ът обработва:
   - `checkout.session.completed`;
   - `checkout.session.async_payment_succeeded`;
   - `checkout.session.expired`;
   - `checkout.session.async_payment_failed`.
3. Запиши signing secret само като Production `STRIPE_WEBHOOK_SECRET`.
4. Изпрати test event и провери 2xx response и точно един reservation/ticket.
5. Replay-ни същото event и докажи idempotency — втори билет/email не се създава.
6. Включи alert/оперативна проверка за повтарящи се webhook failures.

Регистрирай canonical domain в **Payment method domains** за Apple Pay/Google Pay
според изискванията на Stripe. Не регистрирай случайни preview domains.

Не доверявай amount, currency, ticket type, event или buyer identity от browser
payload. Сървърът ги валидира срещу каталога/reservation-а и потвърждава paid
session server-to-server. Не логвай webhook body или payment/customer PII.

## 9. Resend и email

1. Използвай отделен sending subdomain, например `mail.<EMAIL_DOMAIN>`.
2. В Resend **Domains** добави и потвърди предоставените SPF/DKIM DNS records.
3. Добави DMARC policy и постепенно я затегни след наблюдение на reports.
4. `MAIL_FROM` трябва да е verified address от същия domain.
5. Създай send-only API key за конкретната среда; не използвай account-wide key,
   ако provider-ът предлага по-тесен scope.
6. Preview изпраща само до allowlisted/test inbox или local outbox — никога към
   реални потребители от production база.
7. Следи bounces, complaints, suppressions и domain reputation. Не retry-вай
   permanent bounce безкрайно.
8. Email съдържанието не трябва да разкрива QR secret в subject/log. Download
   link-ът минава през authenticated application route.

При delivery failure платената поръчка остава durable. Провери recovery cron-а,
lease/idempotency поведението и че retry създава най-много един PDF и един
финален delivery state.

## 10. Distributed rate limiting и WAF

In-memory limiter не е достатъчен при Vercel scale-out. Production limiter-ът
трябва да използва atomic shared storage; migration за `request_rate_limits`
трябва да е приложена преди deploy. При database грешка чувствителните routes
трябва да fail-ват затворено, а monitoring-ът да алармира.

Добави edge rules във **Vercel -> Project -> Firewall** или еквивалентен WAF:

- строг лимит за `POST /api/verify/start`, login/session и admin login;
- лимит по IP плюс account/email hash за checkout start/complete/cancel;
- ограничение за броя SSE connections към `/api/events` от един клиент;
- отделна защита за public health/readiness route, без скъп DB diagnostic за
  всеки анонимен request;
- body-size ограничения преди JSON parsing;
- generic bot/challenge rule за аномален трафик, без да блокира accessibility;
- webhook route не се поставя зад browser challenge. Той се пази със Stripe
  signature, body limit и контролирана request rate, защото Stripe прави retries.

Rate-limit response трябва да е `429` с `Retry-After`. Не използвай raw email,
session или IP като database key; hash-ни identity и изтривай изтеклите buckets.
Следи cardinality, cleanup latency и размера на `request_rate_limits`.

## 11. Тест с 300 едновременни потребители

Тестът се изпълнява само в изолирана staging среда с Stripe test mode, тестова
DB, тестов bucket/prefix и email sink/контролиран recipient. Не load-test-вай
production, real recipients или Stripe live без изрично разрешение от всички
доставчици.

### Подготовка

- фиксирай commit SHA, environment и seed dataset;
- приложи migrations и запази начални DB counts;
- seed-ни отделно събитие с известен capacity;
- включи Vercel, RDS/Proxy, Stripe, S3 и Resend monitoring;
- дефинирай abort thresholds за 5xx, DB connections, CPU и latency;
- провери provider test-rate limits; първо направи малък rehearsal;
- осигури cleanup script/runbook за sessions, reservations, tickets и PDFs.

### Сценарии

1. **Browse:** 300 users отварят landing/event pages и availability API.
2. **SSE:** 300 едновременни connections стоят отворени поне няколко polling
   интервала и се reconnect-ват с jitter.
3. **Launch spike:** ramp от 0 до 300 virtual users за 10–30 секунди към един
   ticket type.
4. **Scarcity:** capacity 50, а 300 verified users опитват purchase. Резултатът
   трябва да е точно 50 активни reservations/paid tickets и никога отрицателна
   наличност.
5. **FIFO:** сравни `purchase_queue.position`, reservation creation и резултата;
   по-ранна валидна позиция не трябва да бъде прескочена от по-късна.
6. **Duplicate buyer:** паралелни заявки със същия normalized email/event дават
   най-много една активна reservation.
7. **Expiry/cancel:** изтекла или отменена Checkout session връща точно една
   бройка; повторен event не връща втора.
8. **Webhook replay/order:** duplicate и out-of-order success/expired events
   създават най-много един билет и не освобождават платена reservation.
9. **Dependency faults:** забави/прекъсни S3 и email. Paid state остава записан,
   recovery worker доставя по-късно без duplicate.
10. **Recovery:** рестартирай instances по време на load; durable queue и
    reservations остават коректни.

### Наблюдавани метрики и критерии

- **задължително:** zero oversell, zero duplicate ticket, zero unauthorized PDF;
- FIFO invariant и normalized one-active-hold constraint остават валидни;
- 5xx rate и p95/p99 latency са под предварително записаните project thresholds;
- DB connections стоят под 80% от безопасния лимит и няма `too many clients`;
- няма продължителни locks/deadlocks или transactions след timeout;
- Vercel function duration/concurrency и RDS CPU/memory/storage нямат saturation;
- Stripe webhook backlog се изчиства; S3/email retries завършват в договорения
  recovery прозорец;
- след теста DB counts, Stripe sessions и S3 objects се reconcile-ват.

Увеличавай 25 -> 75 -> 150 -> 300 users. Ако threshold се наруши, спри теста,
отстрани bottleneck-а и повтори същия етап; не „доказвай“ устойчивост чрез
продължаване на вече разрушителен тест.

## 12. Incident response

### Първите 15 минути

1. Назначи incident lead и отвори private incident log с UTC timestamps.
2. Определи impact: credentials, DB, payments, email, PDFs/QR, availability.
3. Ограничѝ щетата: WAF block/maintenance protection, pause checkout, revoke key
   или затвори security-group rule. Не унищожавай доказателства.
4. Запази GitHub/Vercel/AWS/Stripe/Resend audit logs, relevant request IDs,
   deployment SHA и DB snapshot. Не записвай secrets в incident log.
5. Уведоми provider support при account compromise или необичайни плащания.

### Playbooks

- **Изтекъл secret:** network restrict -> new credential -> deploy -> test ->
  revoke old -> audit usage -> session invalidation при нужда.
- **Database breach:** блокирай входа, snapshot-ни за forensic analysis, смени
  runtime/migration passwords, провери roles/grants и data changes, възстанови
  само след определяне на root cause.
- **Payment/webhook incident:** pause checkout, сравни Stripe paid sessions с
  reservations/tickets, не издавай билет само по browser success page, retry-ни
  fulfillment idempotently.
- **Oversell:** pause sales за event-а, snapshot-ни inventory/queue/reservations,
  използвай Stripe като payment evidence, не изтривай произволно редове и
  комуникирай засегнатите купувачи по одобрена процедура.
- **Ticket/QR exposure:** маркирай компрометирания билет според operational
  процеса, издай нов QR при необходимост и провери check-in audit trail.
- **Supply-chain compromise:** pin-ни/премахни package/action, rebuild-ни от чист
  trusted commit, ротирай secrets, до които build/deployment е имал достъп.

След containment оцени задълженията за уведомяване на потребители и регулатори
с квалифициран legal/privacy отговорник. След recovery публикувай вътрешен
postmortem: root cause, blast radius, timeline, corrective actions, owner и срок.

## 13. Production release checklist

### Код и GitHub

- [ ] Release-ът е PR към защитен `main`, не директен push.
- [ ] Review е направен специално за auth, authorization, payment и migrations.
- [ ] CI, tests, build, `npm audit --audit-level=high` и CodeQL са зелени.
- [ ] Lockfile промяната е обяснена; няма неизвестен registry или lifecycle hook.
- [ ] Secret scan няма реален credential; docs/tests съдържат само placeholders.
- [ ] Старите migration файлове не са променяни; има нов numbered migration.

### Data и инфраструктура

- [ ] Има pre-migration snapshot и проверен rollback/forward-fix план.
- [ ] Migration е изпълнена с migration role, не с runtime role.
- [ ] `db:check`/schema status е ready и TLS е потвърден.
- [ ] Runtime role няма `CREATE`; точните table/sequence grants са проверени.
- [ ] `request_rate_limits` и cleanup работят в shared production DB.
- [ ] RDS/Proxy connections, alarms, backups и deletion protection са активни.
- [ ] S3 е private; put/get под `tickets/` работят, достъп извън prefix-а отказва.

### Vercel и integrations

- [ ] Production env няма Preview/Development credentials и обратно.
- [ ] Canonical HTTPS domain, redirect, DNS и certificate са проверени.
- [ ] Stripe key modes match; четирите webhook events дават 2xx и replay е
  idempotent.
- [ ] Apple Pay/Google Pay domain registration е валидно за canonical domain.
- [ ] Resend domain/SPF/DKIM/DMARC и `MAIL_FROM` са проверени.
- [ ] Cron secret е поне 32 random characters и recovery cron е наблюдаван.
- [ ] WAF/rate limits са активни и webhook route не е зад browser challenge.

### End-to-end smoke test

- [ ] Signup -> email verification -> login работи.
- [ ] Verified user резервира и плаща в правилния Stripe mode.
- [ ] Наличността намалява в реално време и FIFO/duplicate hold са коректни.
- [ ] Paid webhook създава точно един ticket и PDF.
- [ ] Email се получава; authenticated download работи само за owner/admin.
- [ ] QR check-in работи само за admin и повторно сканиране се отчита правилно.
- [ ] Cancel/expiry възстановява inventory точно веднъж.
- [ ] Monitoring няма нови 5xx, DB saturation или delivery backlog.

Release-ът приключва едва когато има записани deployment SHA, migration version,
оператор, timestamp, smoke-test резултат и rollback decision point. Secrets и
customer data никога не се добавят към този запис.
