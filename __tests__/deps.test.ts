/**
 * Unit tests for src/deps.ts
 *
 * `@actions/exec` is mocked through the shared `__fixtures__/exec.ts` fixture,
 * wired with `jest.unstable_mockModule` before the module under test is
 * dynamically imported. The four gating cases assert the exact apt-get argument
 * arrays and the exact number of exec calls, plus that a rejecting exec
 * propagates.
 */
import { jest } from '@jest/globals'
import * as exec from '../__fixtures__/exec.js'

jest.unstable_mockModule('@actions/exec', () => exec)

const { installDependencies } = await import('../src/deps.js')

describe('deps.ts', () => {
  beforeEach(() => {
    exec.exec.mockResolvedValue(0)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('installs container deps only (install true, vm false)', async () => {
    await installDependencies(true, false)

    expect(exec.exec).toHaveBeenNthCalledWith(1, 'sudo', ['apt-get', 'update'])
    expect(exec.exec).toHaveBeenNthCalledWith(2, 'sudo', [
      'apt-get',
      'install',
      '-y',
      '--no-install-recommends',
      'debootstrap',
      'squashfs-tools'
    ])
    expect(exec.exec).toHaveBeenCalledTimes(2)
  })

  it('appends VM deps after the base packages (install true, vm true)', async () => {
    await installDependencies(true, true)

    expect(exec.exec).toHaveBeenNthCalledWith(1, 'sudo', ['apt-get', 'update'])
    expect(exec.exec).toHaveBeenNthCalledWith(2, 'sudo', [
      'apt-get',
      'install',
      '-y',
      '--no-install-recommends',
      'debootstrap',
      'squashfs-tools',
      'qemu-utils',
      'btrfs-progs',
      'dosfstools'
    ])
    expect(exec.exec).toHaveBeenCalledTimes(2)
  })

  it('installs nothing when install-dependencies is false (vm false)', async () => {
    await installDependencies(false, false)

    expect(exec.exec).not.toHaveBeenCalled()
  })

  it('installs nothing when install-dependencies is false even if vm is true', async () => {
    await installDependencies(false, true)

    expect(exec.exec).not.toHaveBeenCalled()
  })

  it('propagates a non-zero exit from apt-get update', async () => {
    exec.exec.mockRejectedValueOnce(new Error('apt-get update failed'))

    await expect(installDependencies(true, false)).rejects.toThrow(
      'apt-get update failed'
    )
  })
})
