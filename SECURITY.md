# Security Policy

Runverse runs untrusted code, so we take sandbox and API issues seriously.

## Supported versions

Only the latest commit on `main` gets security fixes. Self-hosters should update with `git pull && docker compose up -d --build`.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately, either:

- through [GitHub private vulnerability reporting](https://github.com/toscani-tenekeu/runverse/security/advisories/new), or
- by email to **team.runverse@kmerhosting.com**.

Include what you found, steps to reproduce, and the impact you expect.

We aim to reply within **3 days** and ship a fix for confirmed issues within **30 days**. With your permission, we'll credit you in the release notes.

## Scope

In scope: sandbox escapes, network access from running code, bypassing time, memory or rate limits, reading other users' share links, and injection in the editor or API.

Out of scope: denial of service from heavy traffic, issues that need a misconfigured self-hosted instance, and bugs in upstream [Piston](https://github.com/engineer-man/piston) (report those upstream).

Please test only against your own instance, not runverse.kmerhosting.com.
