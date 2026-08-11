import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTER_SETTINGS } from './types'

describe('shared types', () => {
  it('exports default filter settings', () => {
    expect(DEFAULT_FILTER_SETTINGS.levels).toBe(5)
  })
})
