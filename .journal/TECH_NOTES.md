# Technical Notes

- v1 scope is defined by `docs/DESIGN.md`; implementation order and success
  criteria by `docs/PLAN.md` (7 phases). Start implementation there.
- CI gate is `moon run root:check` (format-check, lint, test, check-dist,
  audit); run it in the worktree before proposing any commit. New worktrees
  need `mise trust` (both worktree and repo root) before `mise install`.
- `.session.md`, `AGENTS.md`, `CLAUDE.md` are in `.prettierignore` on purpose:
  framework-owned, reinstalled verbatim from `~/code/ai`. Never reformat them.
- distrobuilder install facts (verified 2026-07-20): no prebuilt release
  binaries; snap can't pin versions; build from source via upstream `make`;
  binary must run under sudo, hence install to `/usr/local/bin` (on
  `secure_path`).
- Release Please on `main` is blocked: org-level `MEIGMA_RELEASE_APP_ID` /
  `MEIGMA_RELEASE_APP_PRIVATE_KEY` not accessible to this repo; needs org
  admin to add the repo to the access list.
