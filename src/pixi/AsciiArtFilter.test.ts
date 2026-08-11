import { describe, expect, it, vi } from 'vitest'

import {
  ASCII_RAMP_LEVELS,
  ASCII_THEMES,
  drawGlyphAtlas,
  glyphAt,
  glyphAtlasLayout,
  GLYPH_PIXELS,
} from './AsciiArtFilter'

type Recorded = { text: string; x: number; y: number }

function fakeCanvas(context: unknown) {
  return {
    width: 0,
    height: 0,
    getContext: () => context,
  } as unknown as HTMLCanvasElement
}

function recordingContext() {
  const calls: Recorded[] = []
  return {
    calls,
    context: {
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: vi.fn(),
      fillText: (text: string, x: number, y: number) => calls.push({ text, x, y }),
    },
  }
}

describe('ASCII glyph atlas', () => {
  it('lays the ramp out as density columns by variant rows', () => {
    const tallest = Math.max(
      ...ASCII_RAMP_LEVELS.map((level) => level.length),
    )

    expect(glyphAtlasLayout()).toEqual({
      width: ASCII_RAMP_LEVELS.length * GLYPH_PIXELS,
      height: tallest * GLYPH_PIXELS,
      columns: ASCII_RAMP_LEVELS.length,
      rows: tallest,
      glyphPixels: GLYPH_PIXELS,
    })
  })

  it('runs the ramp from blank to solid so brightness maps straight to a column', () => {
    expect(ASCII_RAMP_LEVELS[0]).toBe(' ')
    expect(ASCII_RAMP_LEVELS.at(-1)).toBe('뿅')
    expect(ASCII_RAMP_LEVELS.every((level) => level.length > 0)).toBe(true)
    expect(new Set(ASCII_RAMP_LEVELS.join('')).size).toBe(
      ASCII_RAMP_LEVELS.join('').length,
    )
  })

  it('offers more than one character at most densities', () => {
    const varied = ASCII_RAMP_LEVELS.filter((level) => level.length > 1)

    expect(varied.length).toBeGreaterThanOrEqual(
      Math.ceil(ASCII_RAMP_LEVELS.length / 2),
    )
  })

  it('repeats a short level so any variant row resolves to a character', () => {
    expect(glyphAt(['ab', 'c'], 0, 0)).toBe('a')
    expect(glyphAt(['ab', 'c'], 0, 1)).toBe('b')
    expect(glyphAt(['ab', 'c'], 0, 2)).toBe('a')
    expect(glyphAt(['ab', 'c'], 1, 1)).toBe('c')
  })

  it('draws every variant of every level in its own atlas cell', () => {
    const { calls, context } = recordingContext()
    const canvas = fakeCanvas(context)
    const levels = [' ', '.·', '이아']

    drawGlyphAtlas(levels, 20, () => canvas)

    expect(canvas.width).toBe(3 * 20)
    expect(canvas.height).toBe(2 * 20)
    expect(calls).toHaveLength(6)
    expect(calls[0]).toEqual({ text: ' ', x: 10, y: 20 * 0.54 })
    // Column 2, row 1 is the second variant of the densest level.
    expect(calls.at(-1)).toEqual({ text: '아', x: 50, y: 20 * 1.54 })
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 60, 40)
  })

  it('keeps the paper theme printing dark ink on a light page', () => {
    const paper = ASCII_THEMES.paper
    const terminal = ASCII_THEMES.terminal

    // Density follows brightness in both, so a dark room leaves the page empty.
    expect(paper.invert).toBe(terminal.invert)
    expect(paper.inkGain).toBeLessThan(terminal.inkGain)
    expect(Math.min(...paper.paperColor)).toBeGreaterThan(0.9)
    expect(Math.max(...terminal.paperColor)).toBe(0)
  })

  it('hands the atlas and its ramp to the shader as filter resources', async () => {
    const { context } = recordingContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as never,
    )
    const { AsciiArtFilter, CELL_SIZE } = await import('./AsciiArtFilter')

    const filter = new AsciiArtFilter()
    const uniforms = filter.resources.asciiUniforms.uniforms as Record<
      string,
      number | Float32Array
    >
    const layout = glyphAtlasLayout()

    expect(filter.resources.uGlyphAtlas).toBeTruthy()
    expect(uniforms.uGlyphColumns).toBe(layout.columns)
    expect(uniforms.uGlyphRows).toBe(layout.rows)
    expect(uniforms.uCellSize).toBe(CELL_SIZE)
    expect(uniforms.uColorMix).toBeGreaterThan(0)
    expect(uniforms.uContrast).toBeGreaterThan(1)
    expect((uniforms.uPaperColor as Float32Array).length).toBe(3)
    expect((uniforms.uInkColor as Float32Array).length).toBe(3)

    filter.destroy()
    vi.restoreAllMocks()
  })

  it('explains itself when no 2D context is available', () => {
    expect(() =>
      drawGlyphAtlas(ASCII_RAMP_LEVELS, 24, () => fakeCanvas(null)),
    ).toThrow('아스키 글리프를 그릴 2D 캔버스를 만들 수 없습니다')
  })
})
