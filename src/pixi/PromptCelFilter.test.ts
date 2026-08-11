import { describe, expect, it } from 'vitest'

import { PROMPT_CEL_SAMPLE_COUNT, PromptCelFilter } from './PromptCelFilter'

describe('PromptCelFilter', () => {
  it('uses the fixed one-pass cel-anime shader contract within its sample budget', () => {
    const filter = new PromptCelFilter()
    const source = filter.glProgram.fragment

    expect(filter.resolution).toBe(1)
    expect(PROMPT_CEL_SAMPLE_COUNT).toBeLessThanOrEqual(13)
    expect(source).toContain('uInputSize.zw')
    expect(source).toContain('uInputClamp')
    expect(source).toContain('colorDistance')
    expect(source).toContain('6.0')
    expect(source).toContain('4.0')
    expect(source).toContain('1.12')
    expect(source).toContain('1.08')
    expect(source).toContain('0.08')
    expect(source).toContain('0.22')
    expect(source).toContain('smoothstep')
    expect(source).toContain('sobel')
    expect(source).not.toContain('getImageData')
  })
})
