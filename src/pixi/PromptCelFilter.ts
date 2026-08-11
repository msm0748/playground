import { defaultFilterVert, Filter, GlProgram } from 'pixi.js'

// Conservative one-pass budget: one center, four smoothing cardinals, and eight Sobel neighbors.
// The shader reuses the center/cardinal values, so it performs only nine unique texture reads.
export const PROMPT_CEL_SAMPLE_COUNT = 13

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// Match the default filter vertex shader's effective precision so the WebGL program links.
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;

const vec3 LUMINANCE = vec3(0.299, 0.587, 0.114);

// Filter textures are premultiplied; all shaping happens in straight-alpha color space.
vec3 straightColor(vec4 premultiplied) {
  return premultiplied.a > 0.0 ? premultiplied.rgb / premultiplied.a : vec3(0.0);
}

vec2 clampedCoord(vec2 offset) {
  return clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw);
}

vec3 sampleStraight(vec2 offset) {
  return straightColor(texture(uTexture, clampedCoord(offset)));
}

float sampleLuma(vec3 color) {
  return dot(color, LUMINANCE);
}

float sobel(
  float tl, float t, float tr,
  float l,           float r,
  float bl, float b, float br
) {
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(vec2(gx, gy));
}

void main(void) {
  vec2 texel = uInputSize.zw;
  vec4 source = texture(uTexture, clampedCoord(vec2(0.0)));
  vec3 center = straightColor(source);

  // These four cardinal reads are shared by bilateral smoothing and the Sobel kernel.
  vec3 topColor = sampleStraight(vec2(0.0, -texel.y));
  vec3 leftColor = sampleStraight(vec2(-texel.x, 0.0));
  vec3 rightColor = sampleStraight(vec2(texel.x, 0.0));
  vec3 bottomColor = sampleStraight(vec2(0.0, texel.y));

  vec3 smoothColor = center;
  float totalWeight = 1.0;

  vec3 difference = topColor - center;
  float colorDistance = dot(difference, difference);
  float weight = exp(-colorDistance * 18.0);
  smoothColor += topColor * weight;
  totalWeight += weight;

  difference = leftColor - center;
  colorDistance = dot(difference, difference);
  weight = exp(-colorDistance * 18.0);
  smoothColor += leftColor * weight;
  totalWeight += weight;

  difference = rightColor - center;
  colorDistance = dot(difference, difference);
  weight = exp(-colorDistance * 18.0);
  smoothColor += rightColor * weight;
  totalWeight += weight;

  difference = bottomColor - center;
  colorDistance = dot(difference, difference);
  weight = exp(-colorDistance * 18.0);
  smoothColor += bottomColor * weight;
  totalWeight += weight;

  smoothColor /= totalWeight;

  float smoothLuma = sampleLuma(smoothColor);
  vec3 saturated = vec3(smoothLuma) + (smoothColor - vec3(smoothLuma)) * 1.12;
  vec3 contrasted = (saturated - vec3(0.5)) * 1.08 + vec3(0.5);
  vec3 shaped = clamp(contrasted, 0.0, 1.0);
  vec3 posterized = floor(shaped * 6.0 + 0.5) / 6.0;

  vec3 topLeftColor = sampleStraight(vec2(-texel.x, -texel.y));
  vec3 topRightColor = sampleStraight(vec2(texel.x, -texel.y));
  vec3 bottomLeftColor = sampleStraight(vec2(-texel.x, texel.y));
  vec3 bottomRightColor = sampleStraight(vec2(texel.x, texel.y));

  float sobelGradient = sobel(
    sampleLuma(topLeftColor), sampleLuma(topColor), sampleLuma(topRightColor),
    sampleLuma(leftColor),                            sampleLuma(rightColor),
    sampleLuma(bottomLeftColor), sampleLuma(bottomColor), sampleLuma(bottomRightColor)
  );

  float luma = sampleLuma(posterized);
  float band = floor(luma * 4.0 + 0.5) / 4.0;
  vec3 celColor = posterized * mix(0.68, 1.12, band);
  float ink = smoothstep(0.08, 0.22, sobelGradient) * 0.9;
  vec3 inkColor = vec3(0.06, 0.035, 0.03);
  vec3 finalRgb = clamp(mix(celColor, inkColor, ink), 0.0, 1.0);

  // Return to the premultiplied-alpha representation expected by Pixi's filter pipeline.
  finalColor = vec4(finalRgb * source.a, source.a);
}
`

export class PromptCelFilter extends Filter {
  constructor() {
    super({
      glProgram: new GlProgram({ vertex: defaultFilterVert, fragment }),
      resolution: 1,
    })
  }
}
