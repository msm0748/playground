import { describe, expect, it, vi } from 'vitest'

const extend = vi.fn()

vi.mock('@pixi/react', () => ({ extend }))

describe('CellShadeFilter', () => {
  it('initializes shader uniforms and updates them through its public API', async () => {
    const { CellShadeFilter } = await import('./CellShadeFilter')
    const filter = new CellShadeFilter()

    filter.levels = 7
    filter.edgeStrength = 0.8
    filter.tint = -0.2
    filter.setTexel(640, 360)

    const uniforms = filter.resources.cellShadeUniforms.uniforms
    expect(uniforms.uLevels).toBe(7)
    expect(uniforms.uEdgeStrength).toBe(0.8)
    expect(uniforms.uTint).toBe(-0.2)
    expect(Array.from(uniforms.uTexel as ArrayLike<number>)).toEqual([
      1 / 640,
      1 / 360,
    ])
  })

  it('keeps texel values finite for zero dimensions', async () => {
    const { CellShadeFilter } = await import('./CellShadeFilter')
    const filter = new CellShadeFilter()

    filter.setTexel(0, 0)

    const uniforms = filter.resources.cellShadeUniforms.uniforms
    expect(Array.from(uniforms.uTexel as ArrayLike<number>)).toEqual([1, 1])
  })
})

describe('registerPixi', () => {
  it('registers Pixi components only once', async () => {
    const { registerPixi } = await import('./extendPixi')

    registerPixi()
    registerPixi()

    expect(extend).toHaveBeenCalledTimes(1)
  })
})
