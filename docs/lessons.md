# Lessons
Purpose: Append-only session feedback log; ingested periodically by the ingest-lessons skill.
Scope: Cross-session workflow lessons for this project; read when ingesting lessons or reviewing recurring friction.
Entry points: `docs/lessons.md`
Related: `docs/plans/INDEX.md` — plan index; router at `docs/README.md`
Last-verified: 2026-08-28 — deployment guidance updated for Factory
Status: current

### 2026-08-28 — correction — Factory replaced router hooks
Context: Factory became the deployment authority for the production service
Push `main` to send the exact commit to Factory. The `factory.project.yml` file
is the active contract. The `cicd-router.project.yml` file is audit data only.
Factory keeps the `scripts/cicd-router-gates.sh` filename for the project gate.
A local commit does not start a deployment.

### 2026-08-04 — doc-gap — CLAUDE.md pointed at a deleted deploy script
Context: issue #1 triage session; first deploy attempt ran `./deploy/deploy.sh`, removed a month earlier by f82c1a1
The project CLAUDE.md still documented the retired direct-push deploy and claimed "no test framework" though 32 tests exist. Stale ops docs sent the agent down a dead path.
Proposed fix: applied — CLAUDE.md deploy/test lines rewritten for cicd-router and pnpm in f92423c.

### 2026-08-04 — friction — cicd-router post-commit hook does not fire from sandboxed agent commits
Context: issue #1 fix commit 2a45c7d produced no queue entry; manual enqueue worked immediately
Commits made through the sandboxed Bash tool skip the post-commit enqueue (the hook writes outside the repo), so nothing deploys and no error surfaces. Happened twice in one session.
Proposed fix: after each commit, check the router queue/log and run cicd-router-enqueue.sh manually if absent (now documented in CLAUDE.md).

### 2026-08-04 — friction — gates built from a different lockfile than dev
Context: pnpm migration in efe02eb left package-lock.json behind; router builds used vite 6.4.2 while dev used 6.4.3
Dual lockfiles meant deployed bundles were not the bundles built locally. Consolidated gates + remote bootstrap on pnpm-lock.yaml and deleted package-lock.json in f92423c.

### 2026-08-04 — worked-well — verifying deploys via the router version stamp in /api/health
Context: added cicd-router.version.json passthrough to /api/health during cicd diagnosis
One curl now proves exactly which SHA is live, replacing bundle-hash archaeology in the served JS.
