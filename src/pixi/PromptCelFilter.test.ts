import { describe, expect, it } from 'vitest'

import { PromptCelFilter } from './PromptCelFilter'

describe('PromptCelFilter', () => {
  it('uses the fixed one-pass cel-anime shader contract within its sample budget', () => {
    const filter = new PromptCelFilter()
    const source = filter.glProgram.fragment ?? ''

    expect(filter.resolution).toBe(1)
    const main = source.slice(source.indexOf('void main'))
    const sampleHelper = source.slice(
      source.indexOf('vec3 sampleStraight'),
      source.indexOf('float sampleLuma'),
    )
    const helperCalls = (main.match(/sampleStraight\s*\(/g) ?? []).length
    const readsPerHelper = (sampleHelper.match(/texture\s*\(/g) ?? []).length
    const directReads = (main.match(/texture\s*\(/g) ?? []).length
    const actualTextureReads = directReads + helperCalls * readsPerHelper

    expect(actualTextureReads).toBe(9)
    expect(actualTextureReads).toBeLessThanOrEqual(13)
    expect(source).toContain('uInputSize.zw')
    expect(source).toContain('uInputClamp')
    expect(source).toContain('colorDistance')
    expect(source).toContain(
      'floor(shaped * 5.0 + 0.5) / 5.0',
    )
    expect(source).toContain(
      'min(floor(luma * 4.0), 3.0) / 3.0',
    )
    expect(source).toContain('1.12')
    expect(source).toContain('1.08')
    expect(source).toContain('0.08')
    expect(source).toContain('0.22')
    expect(source).toContain('smoothstep')
    expect(source).toContain('sobel')
    expect(source).not.toContain('getImageData')
  })
})
