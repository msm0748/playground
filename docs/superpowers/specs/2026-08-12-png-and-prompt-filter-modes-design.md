# PNG and Prompt Filter Modes Design

## Goal

Replace the current top-right filter sliders with a mode selector that offers the existing PNG avatar behavior and a new fixed cel-anime prompt mode. Prompt mode must stylize only the live camera pixels inside the existing two-hand quadrilateral, without generative AI, external image APIs, PNG assets, or CPU pixel readback.

## User Experience

The top-right panel becomes `필터 선택` with two exclusive choices:

- `PNG 모드`: preserves the current tracked anime-face overlay and its expression behavior.
- `프롬프트 모드`: applies a fixed Japanese anime/webtoon cel-shading preset to the camera image. The name identifies the mode; there is no text input.

The current `셀 강도`, `윤곽선`, and `틴트` sliders are removed. Mirror and camera restart remain as compact common controls below the mode selector.

PNG mode remains the default so existing behavior does not change on load. Switching modes does not restart the camera or hand tracker. The status overlay and hand-frame guidance remain unchanged.

## Mode Boundaries

`FilterMode` is a two-value application state: `png` or `prompt`.

Both modes share:

- the existing camera texture;
- MediaPipe hand tracking;
- the existing quadrilateral calculation, smoothing, fade behavior, mapping, mirror transform, and Pixi mask;
- the original unfiltered camera outside the quadrilateral.

PNG mode additionally loads the eight registered anime PNG textures, starts face tracking while the hand frame is active, and renders the current expression-matched avatar inside the quadrilateral.

Prompt mode never loads `ANIME_FACE_ASSETS`, never starts the face tracker, and never renders an image asset. It renders one filtered copy of the camera texture through the existing quadrilateral mask at full opacity.

## Prompt-Mode Shader

Prompt mode uses one WebGL fragment shader pass to minimize mobile bandwidth and render-target overhead. It does not call `getImageData`, `putImageData`, Canvas2D pixel APIs, fetch, or an external service.

The shader performs this fixed pipeline:

1. Sample the center and four cardinal neighbors.
2. Compute edge-preserving smoothing weights from color distance, so similar skin/color pixels flatten while strong facial and hair boundaries remain sharp.
3. Increase saturation and contrast slightly.
4. Posterize straight RGB into six levels.
5. Quantize luminance into four bands and apply the band value as cel-shaded light and shadow.
6. Reuse a 3×3 neighborhood to compute Sobel luminance gradients.
7. Apply a lower and upper `smoothstep` threshold so low-energy skin texture and camera noise do not become ink lines.
8. Blend detected edges toward a very dark warm line color rather than pure black, then return premultiplied output alpha.

The shader uses at most thirteen texture reads per output fragment. Coordinates clamp to `uInputClamp`, and texel size comes from `uInputSize.zw`, preserving the current filter-boundary safety.

The preset values are constants rather than user-adjustable settings:

- RGB levels: 6
- luminance bands: 4
- saturation: 1.12
- contrast: 1.08
- edge low threshold: 0.08
- edge high threshold: 0.22
- edge strength: 0.9
- warm ink color: approximately `(0.06, 0.035, 0.03)`

Implementation may tune these constants within 10% during browser QA to match the supplied reference, but it must not expose sliders or add mode-specific persistent settings.

## Rendering and Performance

The base camera sprite always renders first and remains unfiltered. Prompt mode draws a second camera sprite with the cel shader and the existing quadrilateral mask. PNG mode keeps the current filtered-camera underlay and anime avatar overlay.

The Pixi application caps rendering resolution at `min(devicePixelRatio, 1.5)`. The prompt filter itself uses resolution `1` rather than inheriting an unbounded device pixel ratio. No per-frame React state is added beyond the existing tracking state updates, and no pixel buffers move from GPU to CPU.

The target is 30–60fps on a current mobile browser at a 1280×720 camera input. Browser QA records approximate frame cadence over a sustained active hand-frame interval; an average below 30fps is a release blocker for prompt mode.

## Failure Handling

- If prompt shader creation fails, the base camera remains visible and the existing tracker error surface reports that the filter could not start.
- If hand tracking is idle, neither overlay mode renders inside the frame.
- Switching from PNG to prompt mode releases PNG textures and closes the face tracker through the existing effect cleanup.
- Switching back to PNG mode lazily reloads avatar textures and resumes face tracking without restarting the camera stream.

## Components and Files

- `src/types.ts`: defines `FilterMode`; `FilterSettings` retains only common mirror state or is replaced with focused mode/common settings types.
- `src/App.tsx`: owns the selected mode and passes it to controls and the Pixi stage.
- `src/ui/Controls.tsx`: renders the two-choice selector plus compact mirror and restart controls.
- `src/pixi/PromptCelFilter.ts`: owns the fixed one-pass shader and its constant uniforms.
- `src/pixi/HandFrameStage.tsx`: branches resource loading and rendering by mode while preserving shared camera, hand tracking, quad mapping, and mask logic.
- `src/styles.css`: styles the compact mode selector for desktop and narrow mobile widths.

No new PNG, SVG, font, video, or other visual asset is added for prompt mode.

## Testing

Automated tests verify:

- the mode selector exposes exactly PNG and prompt choices and emits the selected mode;
- the removed sliders are absent;
- prompt shader source contains edge-preserving weighting, six-level posterization, four-band luminance quantization, Sobel gradients, thresholding, saturation, and contrast;
- shader texel steps use `uInputSize.zw` and all neighbor coordinates clamp to `uInputClamp`;
- prompt mode skips anime asset loading and face-tracker creation;
- PNG mode retains all existing expression texture and face-tracker behavior;
- both modes use the same mapped quadrilateral and mirror transform;
- mode switching cleans up resources without restarting the camera;
- the full Vitest, lint, and production-build suites pass.

Browser acceptance verifies:

- outside the hand quadrilateral remains the unmodified camera image;
- prompt mode shows flattened color regions, six-level color simplification, four-band cel shadows, and dark facial/hair contours only inside the moving quadrilateral;
- skin texture does not become dense edge noise;
- the filtered region follows translation, scale, rotation, mirror state, and fade behavior in real time;
- PNG mode still shows the expression-matched anime avatar;
- sustained prompt-mode rendering averages at least 30fps on the target mobile test device or equivalent throttled browser profile.

## Acceptance Criteria

- The top-right UI presents PNG and prompt modes instead of the three filter sliders.
- PNG mode preserves current behavior.
- Prompt mode uses only live camera pixels and WebGL shader math; no AI, API, PNG/image asset, or CPU pixel manipulation participates.
- Only the existing hand-defined quadrilateral is stylized.
- The area outside the quadrilateral remains original camera footage.
- Face and hair geometry remain the camera subject's original geometry.
- Prompt mode visibly resembles the supplied cel-animation/webtoon reference while maintaining 30–60fps target performance.
