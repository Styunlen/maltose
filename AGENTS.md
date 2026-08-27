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

**Never commit, or push to any remote (GitHub origin), without explicit human approval first.**

- **Commits also require approval**: do not create commits on the user's behalf unless the user has explicitly asked for them (e.g. "commit this"). When in doubt, stage the work and ask before committing.
- Local work-in-progress is fine; anything that would create a commit or reach a remote (`git commit`, `git push`, force-push, PR creation, release) **must be proposed and await the user's explicit go-ahead**.
- When you have staged or committed work ready to publish, present: what will be committed/pushed, the commit list, and any sensitive-content check — then wait.
- Before proposing a commit or push, verify the diff contains **no secrets, real IPs, or credentials**. If in doubt, ask.
- If the user rejects a commit or push, do not proceed — rebase/amend locally as requested and re-present.
