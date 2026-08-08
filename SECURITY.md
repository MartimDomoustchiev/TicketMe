# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include customer,
credential, payment, ticket, QR-code, or infrastructure data in an issue.

Use GitHub's private vulnerability reporting flow instead:

1. Open the repository's **Security** tab.
2. Select **Advisories**.
3. Select **Report a vulnerability**.

Include the affected route or component, impact, reproduction steps using test
data, and a suggested fix if one is known. Never test against another person's
account or ticket, attempt a real charge, cause service degradation, or extract
production data.

## Supported version

Security fixes target the latest commit on `main`, which is the production
branch. Older commits and private forks are not supported deployments.

## Response priorities

- Critical: exposed credentials, payment bypass, authentication bypass,
  arbitrary ticket access, remote code execution, or inventory overselling.
- High: privilege escalation, stored XSS, SSRF reaching private services,
  webhook forgery, or reliable denial of service.
- Medium/low: limited information disclosure, missing defense in depth, and
  issues requiring an already privileged account.

Rotate any credential immediately if exposure is suspected. Removing a secret
from the latest commit is insufficient because Git history, workflow logs, and
deployment logs may retain it.
