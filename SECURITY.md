# Security policy

GraphCraft is a local-first app: no backend, no accounts, no telemetry.
The attack surface is the browser — malicious expressions, project
files, datasets, and the supply chain.

## Reporting a vulnerability

Do **not** open a public issue for a suspected vulnerability. Report
privately via GitHub Security Advisories for this repository
(`Security` → `Report a vulnerability`). Include: affected version or
commit, steps to reproduce, and impact. Maintainers will acknowledge
receipt, investigate, and credit reporters on request.

## Scope

In scope: expression-evaluation escapes, project/dataset import abuse,
stored-markup injection (SVG/CSV), cache or storage integrity, and
vulnerable dependencies. Out of scope: the hosting setup of third-party
deployments (see `docs/security/AUDIT.md` for operator guidance).

## Guarantees

Fixes land with regression tests and a quality-gate run. Past audits
live in `docs/security/AUDIT.md`; known residual risks are listed
there, not hidden.
