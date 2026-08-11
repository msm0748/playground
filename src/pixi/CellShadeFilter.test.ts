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

    const uniforms = filter.resources.cellShadeUniforms.uniforms
    expect(uniforms.uLevels).toBe(7)
    expect(uniforms.uEdgeStrength).toBe(0.8)
    expect(uniforms.uTint).toBe(-0.2)
  })

  it('renders through the default filter vertex shader at the render target resolution', async () => {
    const { defaultFilterVert } = await import('pixi.js')
    const { CellShadeFilter } = await import('./CellShadeFilter')
    const filter = new CellShadeFilter()

    expect(filter.resolution).toBe('inherit')
    expect(filter.glProgram.vertex).toContain('filterVertexPosition')
    expect(filter.glProgram.vertex).toContain('uOutputFrame')
    expect(defaultFilterVert).toContain('filterTextureCoord')
  })

  it('derives its sobel step from the filter input size instead of the video size', async () => {
    const { CellShadeFilter } = await import('./CellShadeFilter')
    const filter = new CellShadeFilter()

    expect(filter.glProgram.fragment).toContain('vec2 texel = uInputSize.zw')
    expect(filter.glProgram.fragment).toContain('uInputClamp')
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
