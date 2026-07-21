# setup-distrobuilder

A GitHub Action that installs
[distrobuilder](https://github.com/lxc/distrobuilder) on a GitHub-hosted Linux
runner. It builds distrobuilder from source, caches the compiled binary so
repeat runs are fast, and can optionally install the system packages
distrobuilder needs at build time.

The action does one job: get distrobuilder ready to use. After it finishes, the
runner has a `distrobuilder` binary on `PATH` (and reachable under `sudo`) and,
if requested, the build dependencies needed to build images. You invoke
distrobuilder yourself in a later step — the action never runs it for you.

## What it does

- **Builds distrobuilder from source.** Upstream ships no prebuilt binaries, and
  the snap package cannot pin an arbitrary release, so building from source is
  the only way to install a chosen version. The toolchain it needs (`make`,
  `git`, `gcc`, and Go) is already present on the supported runners.
- **Installs the compiled binary** to `/usr/local/bin/distrobuilder`.
- **Caches the compiled binary** and restores it on later runs (enabled by
  default).
- **Optionally installs the apt build dependencies** distrobuilder shells out to
  at build time.

## What it does not do

- It never runs distrobuilder subcommands (`build-lxc`, `build-incus`,
  `build-dir`, and so on). You run distrobuilder yourself.
- It does not author or template image definition YAML files.
- It does not configure Incus or LXC, create storage pools, or register images.
- It does not support macOS or Windows runners.

## Usage

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
        run: sudo distrobuilder build-lxc ubuntu.yaml
```

## Inputs

| Name                   | Description                                                                                                        | Required | Default               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- | --------------------- |
| `version`              | distrobuilder release to install: `latest`, or an explicit version such as `3.3.1` (a leading `v` is accepted).    | No       | `latest`              |
| `install-dependencies` | Install the apt packages distrobuilder needs to build container / rootfs images (`debootstrap`, `squashfs-tools`). | No       | `true`                |
| `vm-dependencies`      | Also install the packages needed for VM image builds (`qemu-utils`, `btrfs-progs`, `dosfstools`).                  | No       | `false`               |
| `cache`                | Cache the compiled distrobuilder binary and restore it on later runs.                                              | No       | `true`                |
| `token`                | GitHub token used to query the distrobuilder releases API when resolving `latest`.                                 | No       | `${{ github.token }}` |

## Outputs

| Name        | Description                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `version`   | The resolved distrobuilder version that was installed, e.g. `3.3.1`.                                                                  |
| `path`      | Absolute path to the installed binary: `/usr/local/bin/distrobuilder`.                                                                |
| `cache-hit` | `true` if the binary was restored from cache; `false` if it was built from source, which includes every run where `cache` is `false`. |

## Running distrobuilder

The binary is installed at `/usr/local/bin/distrobuilder`, which is on sudo's
`secure_path`, so a plain `sudo distrobuilder ...` command resolves it with no
extra PATH setup. distrobuilder builds require root, so run it under `sudo`;
invoking it without `sudo` fails distrobuilder's own root (EUID) check.

## Caching

When `cache` is enabled (the default):

- The compiled binary at `/home/runner/go/bin/distrobuilder` is cached — the
  runner-user-owned build output, not the root-owned copy under
  `/usr/local/bin`.
- The cache key is `distrobuilder-<ImageOS>-<RUNNER_ARCH>-<version>`: the runner
  image (`ImageOS`, which distinguishes `ubuntu-22.04` from `ubuntu-24.04`), the
  architecture (`RUNNER_ARCH`), and the resolved version. The binary dynamically
  links glibc, so the image and architecture are part of the key.
- Restore is exact-key only — there are no partial matches or `restore-keys`, so
  a build for one version or image can never be restored for another. On a hit
  the action skips the source build and installs the cached binary; on a miss it
  builds from source and then saves the cache under the same key.

When `cache` is disabled, the action skips restore and save entirely, always
builds from source, and reports `cache-hit: false`. Cache restore and save
failures are non-fatal: the action logs a warning and falls back to building
from source.

## Limitations

- GitHub-hosted Linux runners only: `ubuntu-22.04` and `ubuntu-24.04`.
  distrobuilder requires a Linux host, root access, and Debian/Ubuntu apt
  packages, and the hosted runners provide passwordless `sudo`. On a non-Linux
  runner the action fails immediately.
- Version pinning supports the modern `vMAJOR.MINOR[.PATCH]` tag scheme (3.3 and
  later). Older releases used a different `distrobuilder-X.Y` tag naming and are
  out of scope.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). The CI gate is `moon run root:check`.
The bundled action in `dist/` is committed, so rebuild it with
`moon run root:package` after changing `src/` and commit the refreshed `dist/`
in the same change.

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting process.

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your
option. Upstream template code is MIT ([LICENSE.upstream](LICENSE.upstream)).
