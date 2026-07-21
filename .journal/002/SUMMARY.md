---
id: 002
title: Review, implement, and release v1
date: 2026-07-20
status: complete
repos_touched: [setup-distrobuilder]
related_sessions: ["001"]
---

## Goal

Review the v1 design/plan from session 001. The user then expanded the scope:
fix the first-release-resolves-to-v1 gap and execute all seven plan phases
end-to-end (ultracode; per-phase workflows; agents pinned to opus/sonnet),
then unblock Release Please, resolve the Dependabot backlog, and do
post-release cleanup.

## Outcome

Goal met and exceeded. v1 is fully implemented, merged, and released as
1.0.0: tag `v1.0.0` exists and the draft GitHub release awaits human
publish (publishing fires major-version-tag.yml and creates the `v1` major
tag — until then `uses: meigma/setup-distrobuilder@v1` does not resolve).
Main is green (CI, Test Action smoke, Release Please). The smoke test
verified the real behavior on ubuntu-24.04: source build of 3.3.1 in ~64s,
`distrobuilder --version` correct, second invocation restored from cache
with `cache-hit: true`. All four Dependabot PRs resolved. The v1
design/plan docs were removed post-release and the README rewritten.

## Key Decisions

- First release pinned to 1.0.0 by emptying `.release-please-manifest.json`
  to `{}` and setting `initial-version: "1.0.0"` -> the bootstrap manifest
  pinned `0.1.0`, which release-please treats as the last released version
  (first feat release would have been 0.2.0). The two `bump-*-pre-major`
  flags were removed as meaningless at >=1.0.0.
- Review findings hardened into the spec before implementation: pre-clone
  `rm -rf` of the build dir (cache-save failures are non-fatal, so same-job
  rebuilds are legitimate) and a fatal, descriptive error when
  `ImageOS`/`RUNNER_ARCH` are unset (self-hosted Linux passes the platform
  guard; `cache: false` remains usable there).
- Release Please unblocked with REPO-level `MEIGMA_RELEASE_APP_ID` /
  `MEIGMA_RELEASE_APP_PRIVATE_KEY` from 1Password item
  `meigma-release-please` -> repo-level vars/secrets satisfy the workflows'
  `vars.`/`secrets.` contexts, so the org-admin access-list change was never
  needed.
- `root:package` set `runInCI: false` -> `moon ci` ran it concurrently with
  `check-dist`; both invoke `npm run package`, whose leading
  `rimraf ./dist` can kill the other's in-flight rollup build (SIGBUS on
  main). check-dist is deliberately CI's dist validator.
- Prettier exemptions for machine/ephemeral files -> rollup's
  `rollup.config-<timestamp>.mjs` (parallel-glob ENOENT race) and
  `.release-please-manifest.json` (release-please writes compact JSON,
  failing every release PR's format-check).
- Dependabot typescript 5.9->7.0.2 closed + major ignored -> evaluated in an
  isolated worktree: typescript-eslint (peer `<6.1.0` + runtime rejection),
  ts-jest (crashes on TS7 compiler API), and @rollup/plugin-typescript
  (crashes on `ts.ScriptTarget`) all hard-fail; CI can never pass.
- `@types/node` 25->26 merged only after an isolated full-gate evaluation
  proved all tasks green with a byte-identical bundle.

## Changes

- `src/{main,version,install,cache,deps}.ts`, `__tests__/`, `__fixtures__/`,
  `dist/` — full v1 implementation (39 tests, 100% stmt coverage; bundle
  needed `@rollup/plugin-json` for @actions/cache's package.json import).
- `action.yml`, `package.json`, `moon.yml`, `mise.toml`,
  `release-please-config.json`, `.release-please-manifest.json` — real
  action metadata, v1 release pinning.
- `.github/workflows/test-action.yml` — double-invocation smoke test with
  cache-hit assertion (env-passed outputs, pinned checkout).
- `README.md` (rewritten twice: v1 docs, then readme-writer restructure),
  `SECURITY.md`, `CONTRIBUTING.md`; `docs/` removed post-release.
- `eslint.config.mjs`, `.prettierignore`, `.gitignore`, `moon.yml` — the
  three CI-race/format fixes above.
- Repo settings: `MEIGMA_RELEASE_APP_ID` variable +
  `MEIGMA_RELEASE_APP_PRIVATE_KEY` secret (not in git).

## Open Threads

- Draft release v1.0.0 must be PUBLISHED by a human; that moves/creates the
  `v1` major tag. Until then `@v1` is not resolvable (README already
  documents `@v1`).
- Dependabot's typescript 7.x major stays ignored; revisit when
  typescript-eslint, ts-jest, and @rollup/plugin-typescript support TS 7.
- `create-github-app-token` warns `app-id` is deprecated (use `client-id`);
  cosmetic on pinned v3.2.0. The 1Password item already carries `client_id`.
- Accepted minor: a `3.3`-style version input forms tag `v3.3`, which
  upstream doesn't tag — fails cleanly via setFailed; left as designed.

## References

- PR #7 (v1 implementation), #8 (rollup-config lint race), #10 (moon ci dist
  race), #11 (manifest prettier exemption), #12 (docs cleanup + README),
  #9 (release 1.0.0); Dependabot #1/#2/#3 merged, #4 closed.
- Release: https://github.com/meigma/setup-distrobuilder/releases/tag/v1.0.0
  (draft), tag `v1.0.0` at 7963608.
- Prior context: `.journal/001/SUMMARY.md`.

## Lessons

- The Workflow tool delivers `args` to workflow scripts as a JSON STRING;
  parse defensively and fail fast on missing fields, or an implementation
  agent can improvise from repo state (one did — luckily correctly).
- GitHub blocks API merges of PRs touching `.github/workflows/` without a
  `workflow`-scoped token (enforcement is inconsistent); the release app
  lacks the `workflows` permission too. `@dependabot squash and merge`
  works but with ~15 min latency (rebase/ignore commands act fast).
- moon's parallelism makes repo-root temp files and shared outputs race
  hazards: eslint/prettier globs vs rollup's ephemeral compiled config, and
  any two tasks that both build `dist/`.
