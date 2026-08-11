import { defaultFilterVert, Filter, GlProgram } from 'pixi.js'

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// The default filter vertex shader declares these at highp, so match it or the program fails to link.
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;

uniform float uLevels;
uniform float uEdgeStrength;
uniform float uTint;

const vec3 LUMINANCE = vec3(0.299, 0.587, 0.114);

// Filter input is premultiplied, so undo it before doing any color math.
vec3 straightColor(vec4 premultiplied) {
  return premultiplied.a > 0.0 ? premultiplied.rgb / premultiplied.a : vec3(0.0);
}

float sampleLuma(vec2 offset) {
  vec2 coord = clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw);
  return dot(straightColor(texture(uTexture, coord)), LUMINANCE);
}

void main(void) {
  vec4 source = texture(uTexture, vTextureCoord);
  vec3 color = straightColor(source);

  float levels = max(uLevels, 2.0);
  vec3 quantized = floor(color * levels + 0.5) / levels;

  vec2 texel = uInputSize.zw;
  float tl = sampleLuma(vec2(-texel.x, -texel.y));
  float t  = sampleLuma(vec2(0.0, -texel.y));
  float tr = sampleLuma(vec2(texel.x, -texel.y));
  float l  = sampleLuma(vec2(-texel.x, 0.0));
  float r  = sampleLuma(vec2(texel.x, 0.0));
  float bl = sampleLuma(vec2(-texel.x, texel.y));
  float b  = sampleLuma(vec2(0.0, texel.y));
  float br = sampleLuma(vec2(texel.x, texel.y));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = clamp(length(vec2(gx, gy)) * uEdgeStrength * 2.0, 0.0, 1.0);

  vec3 shaded = mix(quantized, vec3(0.0), edge);
  shaded += vec3(uTint, uTint * 0.5, -uTint) * 0.15;
  shaded = clamp(shaded, 0.0, 1.0);

  finalColor = vec4(shaded * source.a, source.a);
}
`

interface CellShadeUniforms {
  uLevels: number
  uEdgeStrength: number
  uTint: number
}

export class CellShadeFilter extends Filter {
  constructor() {
    super({
      glProgram: new GlProgram({ vertex: defaultFilterVert, fragment }),
      resolution: 'inherit',
      resources: {
        cellShadeUniforms: {
          uLevels: { value: 5, type: 'f32' },
          uEdgeStrength: { value: 0.65, type: 'f32' },
          uTint: { value: 0.1, type: 'f32' },
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
}
