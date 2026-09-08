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

## Todo list vs. waiting-on-human (MANDATORY)

OpenCode's todo-continuation timer re-drives any unfinished todo item. **Leaving a
todo that is waiting on the user (commit/push approval, a design decision, missing
info) causes an infinite re-prompt loop** — the timer fires, the agent re-runs the
blocked item, can't proceed, and repeats forever.

Rules to prevent that:

- **Never create a todo for an action that requires the user's approval or input.**
  Commit/push/PR/release proposals are NOT todos. Do the work, end the todo list
  clean (all `completed` or `cancelled`), then *ask in prose* and wait. When the
  user approves in a later message, do the action in that turn — optionally with a
  fresh todo list.
- **Blocking dependencies never sit in the todo list.** If an item is blocked by a
  background task, an external service, or missing information, either (a) mark it
  `pending` and END the response so the completion notification wakes you, or
  (b) mark it `cancelled` and carry the blocker in prose instead. Never leave a
  `pending`/`in_progress` todo that you cannot make progress on right now.
- **One `in_progress` at a time, and only while actively working.** When you stop
  to wait, no todo may be `in_progress`.
- If a todo truly cannot be finished without the user, `cancelled` it with the
  reason noted in your message rather than leaving it open forever.

