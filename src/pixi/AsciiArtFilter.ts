import { defaultFilterVert, Filter, GlProgram, Texture } from 'pixi.js'

/**
 * Density ramp, faint to solid. Every level holds interchangeable characters of
 * roughly equal ink, and the shader picks between them per cell, so flat areas
 * break up into mixed text instead of one repeated glyph.
 */
export const ASCII_RAMP_LEVELS = [
  ' ',
  '.·',
  '-─',
  '+ㅗ',
  '○ㅇ',
  '이',
  '아',
  '시',
  '레글',
  '뿅',
]

/** Size of one glyph in the atlas; only sets sharpness, not the on-screen size. */
export const GLYPH_PIXELS = 28
/** Screen pixels per character cell. */
export const CELL_SIZE = 12

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uGlyphAtlas;
// Match the default filter vertex shader's effective precision so the WebGL program links.
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;

uniform float uCellSize;
uniform float uGlyphColumns;
uniform float uGlyphRows;
uniform float uColorMix;
uniform float uContrast;
uniform float uInvert;
uniform float uInkGain;
uniform vec3 uInkColor;
uniform vec3 uPaperColor;

const vec3 LUMINANCE = vec3(0.299, 0.587, 0.114);
/** Keeps linear filtering from bleeding the neighbouring glyph into a cell. */
const float GLYPH_INSET = 0.03;

// Filter textures are premultiplied; brightness has to be read in straight alpha.
vec3 straightColor(vec4 premultiplied) {
  return premultiplied.a > 0.0 ? premultiplied.rgb / premultiplied.a : vec3(0.0);
}

vec3 sampleSource(vec2 uv) {
  return straightColor(texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)));
}

/** Stable per-cell noise: the grid is screen-fixed, so a cell keeps its glyph. */
float cellHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
}

void main(void) {
  vec2 pixel = vTextureCoord * uInputSize.xy;
  vec2 cell = floor(pixel / uCellSize);
  vec2 cellCenter = (cell + 0.5) * uCellSize * uInputSize.zw;
  vec2 quarter = uCellSize * 0.25 * uInputSize.zw;

  // Average the cell rather than point-sampling it: one pixel per cell flickers
  // between characters on every frame of camera noise.
  vec3 cellColor = sampleSource(cellCenter + vec2(-quarter.x, -quarter.y));
  cellColor += sampleSource(cellCenter + vec2(quarter.x, -quarter.y));
  cellColor += sampleSource(cellCenter + vec2(-quarter.x, quarter.y));
  cellColor += sampleSource(cellCenter + vec2(quarter.x, quarter.y));
  cellColor *= 0.25;

  float luma = dot(cellColor, LUMINANCE);
  luma = clamp((luma - 0.5) * uContrast + 0.5, 0.0, 1.0);
  // uInvert flips which end of the ramp gets the solid glyphs.
  float density = mix(luma, 1.0 - luma, uInvert);
  float column = floor(min(density * uGlyphColumns, uGlyphColumns - 1.0));
  float row = floor(min(cellHash(cell) * uGlyphRows, uGlyphRows - 1.0));

  vec2 inCell = clamp(fract(pixel / uCellSize), GLYPH_INSET, 1.0 - GLYPH_INSET);
  vec2 atlasUv = vec2(
    (column + inCell.x) / uGlyphColumns,
    (row + inCell.y) / uGlyphRows
  );
  float glyph = texture(uGlyphAtlas, atlasUv).r;

  float alpha = texture(uTexture, clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw)).a;

  // The character already carries brightness, so normalize the cell to its hue
  // and let uInkGain decide how dark the stroke lands on the page.
  float peak = max(cellColor.r, max(cellColor.g, cellColor.b));
  vec3 normalized = cellColor / max(peak, 0.2);
  vec3 ink = mix(uInkColor, normalized * uInkGain, uColorMix);

  finalColor = vec4(mix(uPaperColor, ink, glyph) * alpha, alpha);
}
`

export type GlyphAtlasLayout = {
  width: number
  height: number
  columns: number
  rows: number
  glyphPixels: number
}

export function glyphAtlasLayout(
  levels: string[] = ASCII_RAMP_LEVELS,
  glyphPixels: number = GLYPH_PIXELS,
): GlyphAtlasLayout {
  const rows = levels.reduce((most, level) => Math.max(most, level.length), 1)
  return {
    width: levels.length * glyphPixels,
    height: rows * glyphPixels,
    columns: levels.length,
    rows,
    glyphPixels,
  }
}

/** Levels shorter than the tallest one repeat, so every row lookup is valid. */
export function glyphAt(levels: string[], column: number, row: number): string {
  const level = levels[column]
  return level[row % level.length]
}

export type CanvasFactory = () => HTMLCanvasElement

const createCanvasElement: CanvasFactory = () => document.createElement('canvas')

/**
 * A density-by-variant grid of white glyphs on black; the shader reads the red
 * channel as coverage. Drawn at load time so no character bitmap ships.
 */
export function drawGlyphAtlas(
  levels: string[] = ASCII_RAMP_LEVELS,
  glyphPixels: number = GLYPH_PIXELS,
  createCanvas: CanvasFactory = createCanvasElement,
): HTMLCanvasElement {
  const layout = glyphAtlasLayout(levels, glyphPixels)
  const canvas = createCanvas()
  canvas.width = layout.width
  canvas.height = layout.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('아스키 글리프를 그릴 2D 캔버스를 만들 수 없습니다')
  }

  context.fillStyle = '#000000'
  context.fillRect(0, 0, layout.width, layout.height)
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  // Hangul needs a font stack that actually has it; monospace alone would tofu.
  context.font =
    `bold ${Math.round(glyphPixels * 0.74)}px ` +
    `'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', ui-monospace, monospace`

  for (let column = 0; column < layout.columns; column++) {
    for (let row = 0; row < layout.rows; row++) {
      context.fillText(
        glyphAt(levels, column, row),
        (column + 0.5) * glyphPixels,
        (row + 0.54) * glyphPixels,
      )
    }
  }

  return canvas
}

export type AsciiTheme = 'paper' | 'terminal'

type ThemeSettings = {
  invert: number
  inkGain: number
  inkColor: [number, number, number]
  paperColor: [number, number, number]
}

/** Paper prints dark text on a page; terminal glows on black. */
export const ASCII_THEMES: Record<AsciiTheme, ThemeSettings> = {
  paper: {
    // Density still follows brightness: a webcam's dark room leaves the page
    // empty and the lit face is what gets drawn, like ink on paper.
    invert: 0,
    inkGain: 0.5,
    inkColor: [0.12, 0.14, 0.2],
    paperColor: [0.97, 0.97, 0.95],
  },
  terminal: {
    invert: 0,
    inkGain: 1,
    inkColor: [0.62, 1, 0.72],
    paperColor: [0, 0, 0],
  },
}

export type AsciiArtFilterOptions = {
  levels?: string[]
  cellSize?: number
  glyphPixels?: number
  theme?: AsciiTheme
  /** 0 keeps the theme ink colour, 1 keeps the camera's own colour per cell. */
  colorMix?: number
  contrast?: number
  createCanvas?: CanvasFactory
}

export class AsciiArtFilter extends Filter {
  private readonly glyphTexture: Texture

  constructor(options: AsciiArtFilterOptions = {}) {
    const levels = options.levels ?? ASCII_RAMP_LEVELS
    const glyphPixels = options.glyphPixels ?? GLYPH_PIXELS
    const layout = glyphAtlasLayout(levels, glyphPixels)
    const atlas = Texture.from(
      drawGlyphAtlas(levels, glyphPixels, options.createCanvas),
    )
    const theme = ASCII_THEMES[options.theme ?? 'paper']

    super({
      glProgram: new GlProgram({ vertex: defaultFilterVert, fragment }),
      resolution: 1,
      resources: {
        asciiUniforms: {
          uCellSize: { value: options.cellSize ?? CELL_SIZE, type: 'f32' },
          uGlyphColumns: { value: layout.columns, type: 'f32' },
          uGlyphRows: { value: layout.rows, type: 'f32' },
          uColorMix: { value: options.colorMix ?? 0.8, type: 'f32' },
          uContrast: { value: options.contrast ?? 1.3, type: 'f32' },
          uInvert: { value: theme.invert, type: 'f32' },
          uInkGain: { value: theme.inkGain, type: 'f32' },
          uInkColor: { value: new Float32Array(theme.inkColor), type: 'vec3<f32>' },
          uPaperColor: {
            value: new Float32Array(theme.paperColor),
            type: 'vec3<f32>',
          },
        },
        uGlyphAtlas: atlas.source,
      },
    })

    this.glyphTexture = atlas
  }

  /** The atlas is owned by this filter, so it goes when the filter does. */
  override destroy(destroyPrograms?: boolean): void {
    super.destroy(destroyPrograms)
    this.glyphTexture.destroy(true)
  }
}
