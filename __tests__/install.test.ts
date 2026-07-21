/**
 * Unit tests for src/install.ts
 *
 * `@actions/exec` is mocked through the shared `__fixtures__/exec.ts` fixture and
 * `node:fs/promises` through a factory exposing an `rm` mock, both wired with
 * `jest.unstable_mockModule` before the module under test is dynamically
 * imported. `RUNNER_TEMP` is pinned in `beforeEach` so the computed clone
 * directory is deterministic and the tests stay hermetic.
 */
import { jest } from '@jest/globals'
import * as os from 'node:os'
import * as path from 'node:path'
import * as exec from '../__fixtures__/exec.js'

const rm = jest.fn<typeof import('node:fs/promises').rm>()

jest.unstable_mockModule('@actions/exec', () => exec)
jest.unstable_mockModule('node:fs/promises', () => ({ rm }))

const { buildBinary, placeBinary, buildOutputPath } =
  await import('../src/install.js')

const RUNNER_TEMP = '/tmp/runner-temp'
const CLONE_DIR = path.join(RUNNER_TEMP, 'distrobuilder-src')

const originalRunnerTemp = process.env.RUNNER_TEMP

describe('install.ts', () => {
  beforeEach(() => {
    process.env.RUNNER_TEMP = RUNNER_TEMP
    exec.exec.mockResolvedValue(0)
    rm.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (originalRunnerTemp === undefined) {
      delete process.env.RUNNER_TEMP
    } else {
      process.env.RUNNER_TEMP = originalRunnerTemp
    }
  })

  describe('buildBinary', () => {
    it('removes the clone dir before cloning, then builds', async () => {
      const result = await buildBinary('v3.3.1')

      // The pre-existing clone directory is removed first.
      expect(rm).toHaveBeenCalledWith(CLONE_DIR, {
        recursive: true,
        force: true
      })

      // git clone runs with the exact expected arguments.
      expect(exec.exec).toHaveBeenNthCalledWith(1, 'git', [
        'clone',
        '--depth',
        '1',
        '--branch',
        'v3.3.1',
        'https://github.com/lxc/distrobuilder',
        CLONE_DIR
      ])

      // make runs in the clone directory.
      expect(exec.exec).toHaveBeenNthCalledWith(2, 'make', [], {
        cwd: CLONE_DIR
      })

      // The removal happens before the first exec call.
      expect(rm.mock.invocationCallOrder[0]).toBeLessThan(
        exec.exec.mock.invocationCallOrder[0]
      )

      // The returned path is the exported build output path.
      expect(result).toBe(buildOutputPath)
      expect(buildOutputPath).toBe(
        path.join(os.homedir(), 'go/bin/distrobuilder')
      )
    })

    it('propagates a non-zero exit from the build', async () => {
      exec.exec.mockRejectedValueOnce(new Error('git clone failed'))

      await expect(buildBinary('v3.3.1')).rejects.toThrow('git clone failed')
    })
  })

  describe('placeBinary', () => {
    it('installs the binary with sudo and returns the install path', async () => {
      const result = await placeBinary(buildOutputPath)

      expect(exec.exec).toHaveBeenCalledWith('sudo', [
        'install',
        '-m',
        '0755',
        buildOutputPath,
        '/usr/local/bin/distrobuilder'
      ])
      expect(result).toBe('/usr/local/bin/distrobuilder')
    })

    it('propagates a non-zero exit from the install', async () => {
      exec.exec.mockRejectedValueOnce(new Error('install failed'))

      await expect(placeBinary(buildOutputPath)).rejects.toThrow(
        'install failed'
      )
    })
  })
})
