/**
 * Optional apt-based installation of distrobuilder's build-time dependencies.
 *
 * distrobuilder shells out to tools it does not bundle when building images.
 * This module installs the minimum set for container / rootfs builds and, when
 * requested, the extra tooling for VM image builds. Both are gated by the
 * `install-dependencies` flag: when it is `false` the action installs nothing
 * and `vm-dependencies` is ignored, because VM builds still need the container /
 * rootfs tooling, so the base flag gates everything.
 */
import { exec } from '@actions/exec'

/** apt packages needed for container / rootfs image builds. */
const CONTAINER_PACKAGES = ['debootstrap', 'squashfs-tools']

/** Additional apt packages needed for VM image builds. */
const VM_PACKAGES = ['qemu-utils', 'btrfs-progs', 'dosfstools']

/**
 * Installs the apt packages distrobuilder needs at build time.
 *
 * When `installDeps` is `false` nothing is installed and no commands run;
 * `vmDeps` is ignored in that case. Otherwise `apt-get update` runs, followed by
 * a single `apt-get install` of the container / rootfs packages, with the VM
 * packages appended when `vmDeps` is also `true`. Both commands run under
 * `sudo`, and any non-zero exit propagates so the orchestrator's try/catch can
 * surface it via `setFailed`.
 *
 * @param installDeps Whether to install build dependencies at all.
 * @param vmDeps Whether to additionally install VM image build dependencies.
 */
export async function installDependencies(
  installDeps: boolean,
  vmDeps: boolean
): Promise<void> {
  if (!installDeps) {
    return
  }

  const packages = vmDeps
    ? [...CONTAINER_PACKAGES, ...VM_PACKAGES]
    : [...CONTAINER_PACKAGES]

  await exec('sudo', ['apt-get', 'update'])
  await exec('sudo', [
    'apt-get',
    'install',
    '-y',
    '--no-install-recommends',
    ...packages
  ])
}
