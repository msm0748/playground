import { describe, expect, it } from 'vitest'

import { PromptCelFilter } from './PromptCelFilter'

describe('PromptCelFilter', () => {
  const source = new PromptCelFilter().glProgram.fragment ?? ''

  it('stays inside its one-pass sample budget', () => {
    const filter = new PromptCelFilter()

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
    expect(source).not.toContain('getImageData')
  })

  it('smooths the whole neighbour ring, not just the cardinals', () => {
    const main = source.slice(source.indexOf('void main'))

    expect((main.match(/gather\s*\(/g) ?? []).length).toBe(8)
    expect(source).toContain('colorDistance')
    expect(source).toContain('const float RANGE_FALLOFF = 26.0;')
    expect(source).toContain('const float DIAGONAL_WEIGHT = 0.7;')
    expect(source).toContain('const float SAMPLE_RADIUS = 1.6;')
  })

  it('quantizes brightness instead of each channel so skin keeps its hue', () => {
    expect(source).toContain('const float TONE_BANDS = 6.0;')
    expect(source).toContain('float toneLuma = softQuantize(shapedLuma);')
    expect(source).toContain('shaped * (toneLuma / shapedLuma)')
    expect(source).not.toContain('floor(shaped * 5.0 + 0.5) / 5.0')
  })

  it('eases across every cel step so sensor noise cannot flicker a band', () => {
    expect(source).toContain('const float BAND_SOFTNESS = 0.28;')
    expect(source).toContain(
      'smoothstep(0.5 - BAND_SOFTNESS, 0.5 + BAND_SOFTNESS, position)',
    )
  })

  it('shapes tone before quantizing and inks the edges last', () => {
    expect(source).toContain('const float SATURATION = 1.35;')
    expect(source).toContain('const float CONTRAST = 1.14;')
    expect(source).toContain('const float SHADOW_LIFT = 0.06;')
    // High enough that webcam grain never inks a flat cheek.
    expect(source).toContain('const float INK_LOW = 0.28;')
    expect(source).toContain('const float INK_HIGH = 0.55;')
    expect(source).toContain('smoothstep(INK_LOW, INK_HIGH, sobelGradient)')
    expect(source).toContain('sobel')
    expect(source.indexOf('smoothstep(INK_LOW')).toBeGreaterThan(
      source.indexOf('float toneLuma'),
    )
  })
})
