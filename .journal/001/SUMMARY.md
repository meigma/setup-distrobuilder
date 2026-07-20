---
id: 001
title: Begin setup-distrobuilder development
date: 2026-07-20
status: complete
repos_touched: [setup-distrobuilder]
related_sessions: []
---

## Goal

Produce the v1 design and implementation plan documents for the
setup-distrobuilder GitHub Action, sized for a small single-purpose action and
ready to drive future implementation sessions.

## Outcome

Goal met. `docs/DESIGN.md` and `docs/PLAN.md` are merged to `main` via PR #6
(squash). The docs were produced by a multi-agent workflow (Sonnet/Opus agents:
repo-context reader, distrobuilder web researcher, author, two adversarial
review/revise rounds) and then hand-verified. The same PR fixed `main`'s CI,
which had been red since PR #5.

## Key Decisions

- Install distrobuilder by building from source with upstream `make` -> the
  `version` input must pin arbitrary releases; GitHub releases ship no prebuilt
  binaries and the snap has no per-version tracks (and hangs on runners).
- Cache the compiled binary (`/home/runner/go/bin/distrobuilder`) keyed
  `distrobuilder-<ImageOS>-<RUNNER_ARCH>-<version>`, exact-key only -> absorbs
  the multi-minute source-build cost; glibc linkage makes OS+arch part of the
  key.
- Place the binary at `/usr/local/bin` via a reusable `placeBinary` step ->
  distrobuilder must run under sudo, and `/usr/local/bin` is on sudo's
  `secure_path`, so users run plain `sudo distrobuilder ...` (no path
  interpolation, no tool-cache/`addPath`, which sudo would ignore).
- Exempt `.session.md`, `AGENTS.md`, `CLAUDE.md` from prettier instead of
  reformatting -> they are framework-owned and reinstalled verbatim from
  `~/code/ai`; reformatting would break re-install idempotency and re-redden CI
  on every reinstall.

## Changes

- `docs/DESIGN.md` - new: purpose/non-goals, 5 inputs / 3 outputs,
  build-from-source install, caching, apt deps split container vs VM, error
  handling, module/testing structure.
- `docs/PLAN.md` - new: seven phases with exact file lists and verifiable
  success criteria; completing all seven is v1.
- `.prettierignore` - added the three framework-owned protocol files (CI fix).

## Open Threads

- Release Please fails on `main`: `vars.MEIGMA_RELEASE_APP_ID` /
  `secrets.MEIGMA_RELEASE_APP_PRIVATE_KEY` are not visible to this repo. The
  org-level variable/secret access list needs this repository added — requires
  org admin (josh); agent token lacks `admin:org`.
- v1 implementation itself: not started. Follow `docs/PLAN.md` phases 1-7.

## References

- PR #6 (docs + CI fix): https://github.com/meigma/setup-distrobuilder/pull/6
- PR #5 (session protocol install): https://github.com/meigma/setup-distrobuilder/pull/5
- Workflow run artifacts (agent transcripts): local session state only.
