# setup-distrobuilder — Design

## Purpose

`setup-distrobuilder` is a GitHub Action that installs
[distrobuilder](https://github.com/lxc/distrobuilder) on a GitHub-hosted Linux
runner and performs the post-install setup a job needs before it can build
images. It caches the compiled binary so repeat runs are fast, and it can
optionally install the system packages distrobuilder shells out to at build
time.

The action does one job: get distrobuilder ready to use. After it finishes, the
runner has a `distrobuilder` binary on `PATH` (and reachable under `sudo`), and,
if requested, the runtime dependencies needed to build images.

## Non-goals

- **It is not a wrapper around distrobuilder.** The action never runs
  `build-lxc`, `build-incus`, `build-dir`, or any other distrobuilder
  subcommand. Users invoke distrobuilder themselves in a later step.
- It does not author or template image definition YAML files.
- It does not configure Incus or LXC, create storage pools, or register images.
- It does not install distrobuilder via snap (see version resolution for why).
- It targets GitHub-hosted Linux runners only; it does not attempt to support
  macOS or Windows runners.

## Example usage

```yaml
jobs:
  build-image:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5

      - name: Set up distrobuilder
        id: setup
        uses: meigma/setup-distrobuilder@v1
        with:
          version: '3.3.1'
          vm-dependencies: 'true'

      # You run distrobuilder yourself — the action only installs it.
      # distrobuilder must run as root; the binary is on sudo's secure_path.
      - name: Build an image
        run: sudo ${{ steps.setup.outputs.path }} build-lxc ubuntu.yaml
```

## Action interface

### Inputs

| Name                   | Description                                                                                                        | Required | Default               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- | --------------------- |
| `version`              | distrobuilder release to install: `latest`, or an explicit version such as `3.3.1` (a leading `v` is accepted).    | No       | `latest`              |
| `install-dependencies` | Install the apt packages distrobuilder needs to build container / rootfs images (`debootstrap`, `squashfs-tools`). | No       | `true`                |
| `vm-dependencies`      | Also install the packages needed for VM image builds (`qemu-utils`, `btrfs-progs`, `dosfstools`).                  | No       | `false`               |
| `cache`                | Cache the compiled distrobuilder binary and restore it on later runs.                                              | No       | `true`                |
| `token`                | GitHub token used to query the distrobuilder releases API when resolving `latest`.                                 | No       | `${{ github.token }}` |

### Outputs

| Name        | Description                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `version`   | The resolved distrobuilder version that was installed, e.g. `3.3.1`.                                                                  |
| `path`      | Absolute path to the installed binary: `/usr/local/bin/distrobuilder`.                                                                |
| `cache-hit` | `true` if the binary was restored from cache; `false` if it was built from source, which includes every run where `cache` is `false`. |

## Install and version resolution

distrobuilder has no prebuilt binaries: GitHub releases only attach a source
tarball, and the snap package exposes just `stable`/`candidate`/`edge` channels
(currently stuck at 3.1) with no per-version tracks, so snap cannot pin a chosen
release and is known to hang on runners. The only method that can install an
arbitrary pinned version is **building from source**, and the toolchain it needs
(`make`, `git`, `gcc`, and Go) is provided by the supported runners
(`ubuntu-22.04`, `ubuntu-24.04`). The preinstalled Go can lag the version in
distrobuilder's `go.mod` (currently 1.25.6 and climbing); when it does, Go's
default `GOTOOLCHAIN=auto` fetches the required toolchain automatically, so the
build still succeeds. This is the single install method the action uses.

Version resolution:

- `latest` → the action calls
  `GET https://api.github.com/repos/lxc/distrobuilder/releases/latest` (with
  `token` for authentication) and reads `tag_name`, e.g. `v3.3.1`.
- An explicit value like `3.3.1` (or `v3.3.1`) is normalized to the version
  `3.3.1` and the git tag `v3.3.1`.

The build produces the binary at the **build output path**
`path.join(os.homedir(), 'go/bin/distrobuilder')`, which resolves to
`/home/runner/go/bin/distrobuilder` on GitHub-hosted runners. This is the one
place the path is defined; both the install and caching code use this resolved
absolute path — never a literal `~` — because neither `@actions/exec` (which
does not run through a shell) nor `@actions/cache` (which globs paths) would
expand a tilde.

Build steps:

1. `git clone --depth 1 --branch <tag> https://github.com/lxc/distrobuilder`
   into `$RUNNER_TEMP/distrobuilder-src`.
2. Run `make` in that directory. The upstream Makefile sets the required build
   tags (`containers_image_openpgp`, etc.) and runs `go install`, producing the
   binary at the build output path. Using `make` (rather than a raw
   `go install`) means the action never has to track those build tags itself.
3. `sudo install -m 0755 <build output path> /usr/local/bin/distrobuilder` so
   the binary is on both the normal `PATH` and sudo's `secure_path`. This
   place-the-binary step also runs after a cache restore, since what is cached
   is the build output, not the root-owned `/usr/local/bin` copy.

The distrobuilder `version` is a user-facing input, not a CLI this action ships
in lockstep with, so its default is a plain string. The
`# x-release-please-version` marker described in the template is deliberately
**not** applied to it — release-please tracks this action's own version, not
distrobuilder's.

## Caching design

When `cache` is `true`:

- **What is cached:** the compiled binary at the build output path
  (`/home/runner/go/bin/distrobuilder`, defined in the Install section above).
  This is the runner-user-owned build output, not the root-owned copy under
  `/usr/local/bin`, so the cache action can read and restore it without
  permission problems.
- **Cache key:** `distrobuilder-<ImageOS>-<RUNNER_ARCH>-<version>`, where
  `<ImageOS>` is the `ImageOS` environment variable (e.g. `ubuntu24`, which
  distinguishes 22.04 from 24.04), `<RUNNER_ARCH>` is `RUNNER_ARCH` (e.g.
  `X64`), and `<version>` is the resolved version (e.g. `3.3.1`). The binary
  dynamically links glibc, so the OS image and architecture must be part of the
  key; the version pins the exact build.
- **Restore behavior:** exact-key restore only — no `restore-keys` / partial
  matches, so a build for one version or OS can never be restored for another.
  On a hit the action skips the clone-and-build step, `sudo install`s the
  restored binary to `/usr/local/bin`, and sets `cache-hit` to `true`. On a miss
  it builds from source, then saves the cache under the same key.
- When `version` is `latest`, the key uses the _resolved_ version, so later runs
  that resolve to the same release still hit the cache.

When `cache` is `false`, the action skips restore and save entirely, always
builds from source, and reports `cache-hit: false`.

Cache restore and save failures are non-fatal: the action logs a warning and
falls back to building from source.

## Post-install configuration

Building an image needs tools that distrobuilder shells out to but does not
bundle. The runner already provides `rsync` and `gnupg`, so the action never
installs those. The optional, apt-based setup it does perform:

- `install-dependencies: true` (default) installs `debootstrap` and
  `squashfs-tools` — the minimum for container / rootfs builds.
- `vm-dependencies: true` layers `qemu-utils`, `btrfs-progs`, and `dosfstools`
  on top of that base set for VM image builds. `qemu-utils` (which provides
  `qemu-img`, the tool distrobuilder invokes to write VM disk images) is chosen
  over upstream's `qemu-kvm` because building images needs only the image
  tooling, not the KVM virtualization stack. `vm-dependencies` only takes effect
  when `install-dependencies` is `true`; VM builds still need the container /
  rootfs tooling, so `vm-dependencies` is ignored when `install-dependencies` is
  `false` and nothing is installed.

Both run `sudo apt-get update` followed by
`sudo apt-get install -y --no-install-recommends <packages>`.

What the action deliberately does **not** configure: it does not install
Windows-repack tooling (`libwin-hivex-perl`, `wimtools`, `genisoimage`), does
not set up Incus/LXC, and does not touch storage or networking. Set
`install-dependencies: false` to install nothing and manage build dependencies
yourself.

## Platform support and limitations

- Supported: GitHub-hosted Linux runners (`ubuntu-22.04`, `ubuntu-24.04`).
  distrobuilder requires a Linux host, root access, and Debian/Ubuntu apt
  packages; the runners provide passwordless `sudo`.
- On a non-Linux runner (`process.platform !== 'linux'`) the action fails
  immediately with a clear message and takes no other action.
- distrobuilder builds require root. The action installs the binary to
  `/usr/local/bin` so `sudo distrobuilder ...` resolves through `secure_path`;
  running it without `sudo` will fail distrobuilder's own EUID check.
- Only releases using the modern `vMAJOR.MINOR[.PATCH]` tag scheme (3.3 and
  later) are supported. Older tags used a different `distrobuilder-X.Y` naming
  scheme and are out of scope.

## Error handling

The `run()` entry point wraps its logic in `try/catch` and calls
`core.setFailed(error.message)` on any thrown error, following the template
convention. Specific cases:

- Non-Linux runner: `setFailed` before any side effects.
- Version resolution failure (releases API returns non-200, or the response has
  no usable `tag_name`, or an explicit version is malformed): `setFailed` with
  the reason.
- Build failure (`git clone` or `make` exits non-zero): the `@actions/exec` call
  throws and is surfaced by `setFailed`.
- Dependency install failure (`apt-get` exits non-zero): surfaced by
  `setFailed`.
- Cache restore/save failure: **non-fatal** — logged via `core.warning`; the run
  continues by building from source.

## Implementation structure and testing

The action keeps the template's shape: a thin `src/index.ts` that imports and
calls `run`, and `src/main.ts` exporting the `run()` orchestrator with the
`try/catch/setFailed` pattern. The placeholder `wait` sample is removed and
replaced by focused modules:

- `src/version.ts` — `resolveVersion(spec, token)` → `{ version, tag }`.
- `src/install.ts` — defines the build output path (the single source of truth
  for `/home/runner/go/bin/distrobuilder`, resolved via `os.homedir()`) and
  exports two functions: `buildBinary(tag)` clones and runs `make`, returning
  that build output path; `placeBinary(sourcePath)` runs the `sudo install` and
  returns the install path `/usr/local/bin/distrobuilder`. Splitting the two
  keeps the `sudo install` in one place that `run()` can call on both the
  cache-miss path (with `buildBinary`'s output) and the cache-hit path (with the
  restored binary at the build output path). The `path` output is always
  `placeBinary`'s return value, so it is correct on both paths.
- `src/cache.ts` — cache-key composition plus restore/save wrappers over the
  build output path imported from `src/install.ts` (the same single definition).
- `src/deps.ts` — optional apt dependency installation.

Testing follows the template exactly. `@actions/*` is never imported directly in
tests; each dependency is mocked through `__fixtures__/` (`core.ts`, plus new
`exec.ts` and `cache.ts`), wired with `jest.unstable_mockModule` before the
module under test is dynamically imported. Each source module has a matching
`__tests__/*.test.ts`; `version.test.ts` mocks the global `fetch`.
`__tests__/main.test.ts` mocks the four modules and asserts orchestration and
`setFailed` behavior. An end-to-end smoke workflow
(`.github/workflows/test-action.yml`) runs the built action twice on
`ubuntu-24.04`, asserts `distrobuilder --version`, and checks that the second
invocation reports `cache-hit: true` (it restores what the first run built,
within a single workflow run).

The bundled output at `dist/index.js` is committed; edits to `src/` must be
followed by `moon run root:package` and the rebuilt `dist/` committed in the
same change, which CI's `check-dist` enforces.
