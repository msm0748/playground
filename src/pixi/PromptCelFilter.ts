import { defaultFilterVert, Filter, GlProgram } from 'pixi.js'

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// Match the default filter vertex shader's effective precision so the WebGL program links.
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;

const vec3 LUMINANCE = vec3(0.299, 0.587, 0.114);

/** Wider than one texel: webcam skin only reads as flat cel paint past ~1.5px. */
const float SAMPLE_RADIUS = 1.6;
/** Bilateral range falloff. High enough that eyes, lips and hair keep their edges. */
const float RANGE_FALLOFF = 26.0;
/** Diagonal neighbours sit further away, so they carry less of the blur. */
const float DIAGONAL_WEIGHT = 0.7;
const float SATURATION = 1.35;
const float CONTRAST = 1.14;
/** Lifts the darkest skin shadows the way flat anime shading does. */
const float SHADOW_LIFT = 0.06;
/** Brightness steps in the cel ramp. */
const float TONE_BANDS = 6.0;
/** Cross-fade width at each step: hard steps make sensor noise flicker bands. */
const float BAND_SOFTNESS = 0.28;
const float INK_LOW = 0.28;
const float INK_HIGH = 0.55;
const vec3 INK_COLOR = vec3(0.07, 0.05, 0.06);
/** A touch of warmth so quantized skin does not read as grey. */
const vec3 WARM_TINT = vec3(1.03, 1.0, 0.97);

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

/** Steps brightness onto the cel ramp, easing across each step. */
float softQuantize(float value) {
  float scaled = value * TONE_BANDS;
  float band = floor(scaled);
  float position = scaled - band;
  return (band + smoothstep(0.5 - BAND_SOFTNESS, 0.5 + BAND_SOFTNESS, position)) / TONE_BANDS;
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

/** Edge-aware accumulation: a neighbour across an edge barely counts. */
void gather(
  vec3 neighbor,
  vec3 center,
  float spatialWeight,
  inout vec3 total,
  inout float totalWeight
) {
  vec3 difference = neighbor - center;
  float colorDistance = dot(difference, difference);
  float weight = spatialWeight * exp(-colorDistance * RANGE_FALLOFF);
  total += neighbor * weight;
  totalWeight += weight;
}

void main(void) {
  vec2 texel = uInputSize.zw * SAMPLE_RADIUS;
  vec4 source = texture(uTexture, clampedCoord(vec2(0.0)));
  vec3 center = straightColor(source);

  // One ring of neighbours, shared by the bilateral blur and the Sobel kernel.
  vec3 topLeftColor = sampleStraight(vec2(-texel.x, -texel.y));
  vec3 topColor = sampleStraight(vec2(0.0, -texel.y));
  vec3 topRightColor = sampleStraight(vec2(texel.x, -texel.y));
  vec3 leftColor = sampleStraight(vec2(-texel.x, 0.0));
  vec3 rightColor = sampleStraight(vec2(texel.x, 0.0));
  vec3 bottomLeftColor = sampleStraight(vec2(-texel.x, texel.y));
  vec3 bottomColor = sampleStraight(vec2(0.0, texel.y));
  vec3 bottomRightColor = sampleStraight(vec2(texel.x, texel.y));

  vec3 smoothColor = center;
  float totalWeight = 1.0;
  gather(topColor, center, 1.0, smoothColor, totalWeight);
  gather(leftColor, center, 1.0, smoothColor, totalWeight);
  gather(rightColor, center, 1.0, smoothColor, totalWeight);
  gather(bottomColor, center, 1.0, smoothColor, totalWeight);
  gather(topLeftColor, center, DIAGONAL_WEIGHT, smoothColor, totalWeight);
  gather(topRightColor, center, DIAGONAL_WEIGHT, smoothColor, totalWeight);
  gather(bottomLeftColor, center, DIAGONAL_WEIGHT, smoothColor, totalWeight);
  gather(bottomRightColor, center, DIAGONAL_WEIGHT, smoothColor, totalWeight);
  smoothColor /= totalWeight;

  float smoothLuma = sampleLuma(smoothColor);
  vec3 saturated = vec3(smoothLuma) + (smoothColor - vec3(smoothLuma)) * SATURATION;
  vec3 lifted = saturated * (1.0 - SHADOW_LIFT) + vec3(SHADOW_LIFT);
  vec3 shaped = clamp((lifted - vec3(0.5)) * CONTRAST + vec3(0.5), 0.0, 1.0);

  // Quantize brightness rather than each channel: the steps read as cel shading
  // instead of the hue shifts a per-channel posterize leaves on skin.
  float shapedLuma = max(sampleLuma(shaped), 0.001);
  float toneLuma = softQuantize(shapedLuma);
  vec3 celColor = clamp(shaped * (toneLuma / shapedLuma) * WARM_TINT, 0.0, 1.0);

  float sobelGradient = sobel(
    sampleLuma(topLeftColor), sampleLuma(topColor), sampleLuma(topRightColor),
    sampleLuma(leftColor),                            sampleLuma(rightColor),
    sampleLuma(bottomLeftColor), sampleLuma(bottomColor), sampleLuma(bottomRightColor)
  );

  float ink = smoothstep(INK_LOW, INK_HIGH, sobelGradient);
  vec3 finalRgb = clamp(mix(celColor, INK_COLOR, ink), 0.0, 1.0);

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
