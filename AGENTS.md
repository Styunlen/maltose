# AGENTS.md

Agent guidance for working in this repository. Read `CONTEXT.md` at the repo root for the domain context, `docs/adr/` for decisions, and `docs/glossary/` for term definitions.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root + ADRs in `docs/adr/` + glossary in `docs/glossary/`. See `docs/agents/domain.md`.

## Release gate (MANDATORY)

**Never push to any remote (GitHub origin) without explicit human approval first.**

- Local commits are fine; anything that would reach a remote (`git push`, force-push, PR creation, release) **must be proposed and await the user's explicit go-ahead**.
- When you have unpushed work ready to publish, present: what will be pushed, the commit list, and any sensitive-content check — then wait.
- Before proposing a push, verify the diff/commits contain **no secrets, real IPs, or credentials**. If in doubt, ask.
- If the user rejects a push, do not push — rebase/amend locally as requested and re-present.
