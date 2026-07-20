# setup-distrobuilder — Implementation Plan

This plan takes the repository from a freshly generated copy of
`meigma/template-actions` (the placeholder `wait` sample still in place) to a v1
release. It is the "how and in what order"; see [DESIGN.md](DESIGN.md) for the
"what". Input/output names, cache-key composition, and file paths are kept
identical to DESIGN.md.

Each phase ends in a state where the named success checks pass. Run individual
tasks with `moon run root:<task>`; the full gate is `moon run root:check`
(format-check, lint, test, check-dist, audit), which is what CI runs.

## Phase 1 — Metadata and interface

**Goal:** rename the action, declare its real inputs/outputs, and add the
libraries the implementation needs, without touching `src/` yet.

Tasks:

- `action.yml` — replace `name` (`Setup Distrobuilder`), `description`,
  `author`, and `branding`; replace the sample `milliseconds` input with the
  inputs `version` (default `latest`), `install-dependencies` (default `true`),
  `vm-dependencies` (default `false`), `cache` (default `true`), and `token`
  (default `${{ github.token }}`); replace the `time` output with `version`,
  `path`, and `cache-hit`. Leave `runs.using: node24`, `main: dist/index.js`. Do
  **not** add a `# x-release-please-version` marker to `version`.
- `package.json` — set `name` to `setup-distrobuilder`, update `description`,
  `homepage`, `repository.url`, `bugs.url`, and `keywords`; add dependencies
  `@actions/cache` and `@actions/exec` (`@actions/core` is already present).
- `moon.yml` — update `project.title` and `project.description`.
- `mise.toml` — update the header comment on line 1 that names
  `template-actions` to reference `setup-distrobuilder`.
- `release-please-config.json` — set `packages["."]["package-name"]` to
  `setup-distrobuilder`, set `initial-version` to `1.0.0`, and remove the
  `bump-minor-pre-major` and `bump-patch-for-minor-pre-major` options (both
  meaningless once versions start at `1.0.0`).
- `.release-please-manifest.json` — reset its contents to `{}`; the template's
  bootstrap `".": "0.1.0"` entry would otherwise be treated as the last released
  version, making the first `feat` release `0.2.0` instead of `1.0.0`.
- Run `npm install` to refresh `package-lock.json`.

Success criteria:

- `moon run root:format-check` and `moon run root:lint` pass.
- `moon run root:test` and `moon run root:check-dist` still pass (unchanged
  `src/` and `dist/` still build the sample).
- `action.yml` lists exactly the five inputs and three outputs above.

## Phase 2 — Version resolution module

**Goal:** resolve `latest` or an explicit version to a `{ version, tag }` pair.

Tasks:

- Create `src/version.ts` exporting
  `resolveVersion(spec: string, token: string): Promise<{ version: string; tag: string }>`.
  For `latest`,
  `GET https://api.github.com/repos/lxc/distrobuilder/releases/latest` with the
  token and read `tag_name`; for an explicit value, strip any leading `v`,
  validate it looks like `MAJOR.MINOR[.PATCH]`, and form tag `v<version>`. Throw
  a descriptive error on non-200 responses or malformed input.
- Create `__tests__/version.test.ts` covering `latest` resolution (mock
  `global.fetch`), explicit versions with and without a leading `v`, and error
  paths (non-200, malformed version).

Success criteria:

- `moon run root:test` passes including `version.test.ts`; `root:lint` passes.

## Phase 3 — Build / install module

**Goal:** clone and build distrobuilder from source and place the binary, split
so the place-the-binary step can be reused on a cache hit.

Tasks:

- Create `src/install.ts` that defines the build output path **once** as
  `path.join(os.homedir(), 'go/bin/distrobuilder')`
  (`/home/runner/go/bin/distrobuilder` on GitHub-hosted runners) and exports it,
  so `src/cache.ts` (Phase 4) and `src/main.ts` (Phase 6) share the single
  definition. This is a resolved absolute path, never a literal `~`, because
  neither `@actions/exec` (no shell) nor `@actions/cache` (globs paths) expands
  a tilde. The module exports two functions, both using `@actions/exec`:
  - `buildBinary(tag: string): Promise<string>` — removes any pre-existing
    `$RUNNER_TEMP/distrobuilder-src` (Node `fs.rm`, recursive + force) so a
    second source build in the same job (legitimate when a non-fatal cache save
    failed) does not trip on the leftover clone directory, then runs
    `git clone --depth 1 --branch <tag> https://github.com/lxc/distrobuilder`
    into it, runs `make` there, and returns the build output path.
  - `placeBinary(sourcePath: string): Promise<string>` — runs
    `sudo install -m 0755 <sourcePath> /usr/local/bin/distrobuilder` and returns
    `/usr/local/bin/distrobuilder`. `run()` calls this on both the cache-miss
    path (with `buildBinary`'s return value) and the cache-hit path (with the
    exported build output path), so the `sudo install` lives in exactly one
    place and the `path` output is always this function's return value.
- Create `__fixtures__/exec.ts` mocking `@actions/exec` (`exec`,
  `getExecOutput`).
- Create `__tests__/install.test.ts` asserting that `buildBinary` removes any
  pre-existing clone directory before cloning, invokes the git and make commands
  with the expected arguments, and returns the build output path, that
  `placeBinary` invokes the `sudo install` command and returns
  `/usr/local/bin/distrobuilder`, and that a non-zero exit from either
  propagates as a thrown error.

Success criteria:

- `moon run root:test` passes including `install.test.ts`; `root:lint` passes.

## Phase 4 — Cache module

**Goal:** compute the cache key and restore/save the binary.

Tasks:

- Create `src/cache.ts` exporting `computeCacheKey(version: string): string`
  returning `distrobuilder-<ImageOS>-<RUNNER_ARCH>-<version>` (reading the
  `ImageOS` and `RUNNER_ARCH` environment variables), throwing a descriptive
  error when either is unset (possible only outside GitHub-hosted runners; fatal
  via `setFailed`, and such environments can still use `cache: false`), plus
  `restoreBinary(key)` and `saveBinary(key)` wrapping `@actions/cache`
  `restoreCache` / `saveCache` over the build output path **imported from
  `src/install.ts`** (the single definition established in Phase 3), with
  exact-key matching (no `restore-keys`). Restore/save errors are caught and
  surfaced as warnings, not thrown.
- Create `__fixtures__/cache.ts` mocking `@actions/cache`.
- Create `__tests__/cache.test.ts` covering key composition from the env vars,
  the missing-env error (`computeCacheKey` throws when `ImageOS` or
  `RUNNER_ARCH` is unset), a restore hit vs. miss, and that a thrown cache error
  becomes a warning rather than a failure.

Success criteria:

- `moon run root:test` passes including `cache.test.ts`; `root:lint` passes.

## Phase 5 — Dependencies module

**Goal:** optionally install the apt packages distrobuilder needs at build time.

Tasks:

- Create `src/deps.ts` exporting a function that, given the
  `install-dependencies` and `vm-dependencies` flags, installs nothing when
  `install-dependencies` is `false` (in which case `vm-dependencies` is
  ignored); otherwise runs `sudo apt-get update` then
  `sudo apt-get install -y --no-install-recommends` with `debootstrap` and
  `squashfs-tools` (container deps), adding `qemu-utils`, `btrfs-progs`, and
  `dosfstools` on top when `vm-dependencies` is also `true`. Use `@actions/exec`
  (reuse `__fixtures__/exec.ts`).
- Create `__tests__/deps.test.ts` covering four cases: container-only
  (`install-dependencies` true, `vm-dependencies` false), container+VM (both
  true), the no-op (`install-dependencies` false, `vm-dependencies` false), and
  VM-only (`install-dependencies` false, `vm-dependencies` true) which must also
  be a no-op because the base flag gates VM deps.

Success criteria:

- `moon run root:test` passes including `deps.test.ts`; `root:lint` passes.

## Phase 6 — Orchestration and template teardown

**Goal:** wire the modules together in `run()`, delete the sample, rebuild dist.

Tasks:

- Rewrite `src/main.ts` `run()` to: guard `process.platform === 'linux'` (else
  `setFailed` and return); read inputs (`version`, `install-dependencies`,
  `vm-dependencies`, `cache`, `token`) via `core.getInput` /
  `core.getBooleanInput`; call `resolveVersion`. Then obtain the binary:
  - When `cache` is on, `computeCacheKey` and `restoreBinary`. On a hit, call
    `placeBinary(buildOutputPath)` — importing `buildOutputPath` from
    `src/install.ts` — and set `cache-hit` to `true`.
  - On a miss (and whenever `cache` is off), call `buildBinary(tag)` then
    `placeBinary(...)` with its return value, `saveBinary(key)` when caching is
    on, and set `cache-hit` to `false`.

  Then run `deps.ts`; set outputs `version`, `path` (always `placeBinary`'s
  return value, correct on both paths), and `cache-hit`. Keep the `try/catch` →
  `core.setFailed(error.message)` pattern.

- Delete `src/wait.ts`, `__tests__/wait.test.ts`, and `__fixtures__/wait.ts`.
- Update `__fixtures__/core.ts` to add the mocks the code uses (e.g.
  `getBooleanInput`), keeping the existing `getInput`/`setOutput`/`setFailed`/
  `debug`/`info`/`warning` mocks.
- Rewrite `__tests__/main.test.ts` to mock `../src/version.js`,
  `../src/install.js`, `../src/cache.js`, `../src/deps.js`, and `@actions/core`
  with `jest.unstable_mockModule` before dynamically importing `../src/main.js`;
  assert that `placeBinary` is called and the outputs (`version`, `path`,
  `cache-hit`) are set on both the cache-hit and cache-miss happy paths, and
  that a non-Linux platform and a thrown error both call `setFailed`.
- Rebuild the bundle: `moon run root:package`, and commit the regenerated
  `dist/index.js` and `dist/index.js.map`.

Success criteria:

- `moon run root:check` passes end to end (format-check, lint, test, check-dist,
  audit).
- `grep -r wait src __tests__ __fixtures__` returns nothing.
- `git diff --exit-code -- dist` is clean after `moon run root:package`.

## Phase 7 — Docs, smoke test, and release readiness

**Goal:** document the real action and verify it end to end on a runner.

Tasks:

- `README.md` — replace the "sample action" section with real usage: the example
  workflow from DESIGN.md, the inputs/outputs tables, the sudo/`path` note, and
  the Linux-only limitation. Update any remaining `template-actions`
  identifiers.
- `SECURITY.md` — update the private vulnerability reporting URL from
  `https://github.com/meigma/template-actions/security/advisories/new` to the
  `meigma/setup-distrobuilder` repo, so security reports are routed to this
  repository rather than the template.
- Create `.github/workflows/test-action.yml` — on `push`/`workflow_dispatch`,
  `runs-on: ubuntu-24.04`, checkout, then run the local action (`uses: ./`)
  twice in the same job with the same pinned `version` (step ids `first` and
  `second`). After the first run, a step asserts `distrobuilder --version`
  succeeds and that `steps.first.outputs.path` and `steps.first.outputs.version`
  are populated. After the second run, a step asserts
  `steps.second.outputs.cache-hit == 'true'` — the second invocation restores
  what the first built, so caching is verified automatically within one workflow
  run (`steps.first.outputs.cache-hit` is not asserted, since a persisted cache
  from a previous run could legitimately make the first run a hit too).
- Confirm `.release-please-manifest.json` and `release-please-config.json` are
  ready: the manifest is `{}`, `initial-version` is `1.0.0`, and there is no
  `action.yml` entry in `extra-files` (since `version` is not this action's own
  version).

Success criteria:

- `moon ci --summary minimal` (equivalently `npm run ci`) passes.
- The `test-action.yml` run is green: the action builds/restores distrobuilder,
  `distrobuilder --version` prints a version, and the workflow's own assertion
  step confirms the second `uses: ./` invocation reported `cache-hit: true`
  (verified within the single workflow run, no manual re-trigger needed).
- README documents the exact inputs, outputs, and the `sudo` usage pattern.
- `grep -rn template-actions` over tracked files returns only the historical
  reference in this file (`docs/PLAN.md`, the origin template) — `README.md`,
  `SECURITY.md`, `moon.yml`, `mise.toml`, `package.json`, `package-lock.json`
  (refreshed by the Phase 1 `npm install`), and `release-please-config.json` no
  longer reference it.

Completing all seven phases yields a v1 ready for the release-please flow: a
Conventional Commit on `main` opens the release PR, and merging it produces the
draft release and `vX.Y.Z` tag for a human to publish. With the emptied manifest
and an `initial-version` of `1.0.0`, that first release is `1.0.0`, tagged
`v1.0.0`; publishing it moves the `v1` major compatibility tag
(`major-version-tag.yml`), which is what makes DESIGN.md's
`uses: meigma/setup-distrobuilder@v1` example valid.
