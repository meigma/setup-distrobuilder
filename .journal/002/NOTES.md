---
id: 002
title: Review v1 design and plan
started: 2026-07-20
---

## 2026-07-20 16:09 — Kickoff

Goal for the session: review the v1 design/plan produced in session 001
(`docs/DESIGN.md` and `docs/PLAN.md`) before implementation begins.
Current state of the world: session 001 merged the design and plan docs to
`main` via PR #6 (squash) and fixed main's CI; implementation has not started.
Release Please on `main` remains blocked on org-level secrets access (needs
org admin). Working tree on `main` is clean at 02c40df.
Plan: read both docs in full, assess them against the repo state and the
verified distrobuilder install facts in TECH_NOTES.md, and report findings to
the user.

## 2026-07-20 16:11 — Review findings

Read DESIGN.md and PLAN.md in full and cross-checked against the live repo
(action.yml, package.json, src/, __tests__/, __fixtures__/, mise.toml,
release-please-config.json, workflows, template-actions grep). Verdict: docs
are internally consistent and the plan's Phase 1/7 file lists match the actual
template state exactly. Findings reported to user:

1. Versioning gap (main finding): release-please-config has
   `initial-version: 0.1.0` + `bump-minor-pre-major: true`, so releases start
   at 0.x — but DESIGN's usage example and the plan's closing paragraph promise
   `meigma/setup-distrobuilder@v1`. Nothing in the plan produces a 1.0.0
   release or a `v1` major tag (major-version-tag.yml would maintain `v0`).
   Needs a Release-As bump or config change; not addressed in either doc.
2. Clone-dir collision (minor): buildBinary clones into
   `$RUNNER_TEMP/distrobuilder-src` without cleaning it; a second cache-miss
   build in the same job (e.g. after a non-fatal cache-save failure) would fail
   the clone. Suggest rm -rf first or a unique dir.
3. npm audit watch item: Phase 1 adds `@actions/cache` (heavy transitive tree)
   and the commit gate `moon run root:check` includes
   `npm audit --audit-level=low`; Phase 1's own success criteria omit audit.
4. Cache-key hardening nit: `ImageOS` env read unguarded — undefined would
   silently produce `distrobuilder-undefined-...` on self-hosted Linux (which
   passes the platform guard). Throwing/warning when unset would be cheap.
5. Pre-existing open thread unchanged: Release Please blocked on org-level
   secrets access (needs org admin) — blocks releasing, not phases 1–6.

Strengths noted: single source of truth for the build output path with the
tilde-expansion rationale, exact-key-only cache restore, smoke test asserting
cache-hit only on the second invocation, placeBinary reuse across hit/miss
paths, deps gating incl. the VM-only no-op case.
