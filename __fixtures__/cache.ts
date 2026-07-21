import type * as cacheModule from '@actions/cache'
import { jest } from '@jest/globals'

export const restoreCache = jest.fn<typeof cacheModule.restoreCache>()
export const saveCache = jest.fn<typeof cacheModule.saveCache>()
