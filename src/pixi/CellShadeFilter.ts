import { Filter, GlProgram } from 'pixi.js'

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
  gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
  vTextureCoord = aPosition;
}
`

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uLevels;
uniform float uEdgeStrength;
uniform float uTint;
uniform vec2 uTexel;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float levels = max(uLevels, 2.0);
  vec3 quantized = floor(color.rgb * levels + 0.5) / levels;
  vec3 luminance = vec3(0.299, 0.587, 0.114);

  float tl = dot(texture(uTexture, vTextureCoord + vec2(-uTexel.x, -uTexel.y)).rgb, luminance);
  float t  = dot(texture(uTexture, vTextureCoord + vec2(0.0, -uTexel.y)).rgb, luminance);
  float tr = dot(texture(uTexture, vTextureCoord + vec2(uTexel.x, -uTexel.y)).rgb, luminance);
  float l  = dot(texture(uTexture, vTextureCoord + vec2(-uTexel.x, 0.0)).rgb, luminance);
  float r  = dot(texture(uTexture, vTextureCoord + vec2(uTexel.x, 0.0)).rgb, luminance);
  float bl = dot(texture(uTexture, vTextureCoord + vec2(-uTexel.x, uTexel.y)).rgb, luminance);
  float b  = dot(texture(uTexture, vTextureCoord + vec2(0.0, uTexel.y)).rgb, luminance);
  float br = dot(texture(uTexture, vTextureCoord + vec2(uTexel.x, uTexel.y)).rgb, luminance);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = clamp(length(vec2(gx, gy)) * uEdgeStrength * 2.0, 0.0, 1.0);

  vec3 shaded = mix(quantized, vec3(0.0), edge);
  shaded += vec3(uTint, uTint * 0.5, -uTint) * 0.15;
  finalColor = vec4(clamp(shaded, 0.0, 1.0), color.a);
}
`

interface CellShadeUniforms {
  uLevels: number
  uEdgeStrength: number
  uTint: number
  uTexel: Float32Array | number[]
}

export class CellShadeFilter extends Filter {
  constructor() {
    super({
      glProgram: new GlProgram({ vertex, fragment }),
      resources: {
        cellShadeUniforms: {
          uLevels: { value: 5, type: 'f32' },
          uEdgeStrength: { value: 0.65, type: 'f32' },
          uTint: { value: 0.1, type: 'f32' },
          uTexel: { value: [1 / 1280, 1 / 720], type: 'vec2<f32>' },
        },
      },
    })
  }

  private get uniforms(): CellShadeUniforms {
    return this.resources.cellShadeUniforms.uniforms as unknown as CellShadeUniforms
  }

  set levels(value: number) {
    this.uniforms.uLevels = value
  }

  set edgeStrength(value: number) {
    this.uniforms.uEdgeStrength = value
  }

  set tint(value: number) {
    this.uniforms.uTint = value
  }

  setTexel(width: number, height: number): void {
    this.uniforms.uTexel = [
      1 / Math.max(width, 1),
      1 / Math.max(height, 1),
    ]
  }
}
