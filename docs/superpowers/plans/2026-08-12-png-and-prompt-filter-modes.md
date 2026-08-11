# PNG and Prompt Filter Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current filter sliders with PNG/prompt mode selection and add a fixed, asset-free WebGL cel-anime filter that applies only inside the existing tracked hand quadrilateral.

**Architecture:** Keep camera and hand tracking shared across both modes. PNG mode lazily owns the current anime textures, face tracker, and avatar rendering; prompt mode owns one fixed fragment-shader filter and never loads image assets or creates a face tracker. Both modes reuse the existing Pixi camera texture, mapped quadrilateral, mask, mirror transform, and fade state.

**Tech Stack:** React 19, TypeScript 6, PixiJS 8 WebGL filters, MediaPipe Tasks Vision, Vitest 4, Testing Library, oxlint, Vite 8.

## Global Constraints

- `FilterMode` is exactly `'png' | 'prompt'`; PNG remains the default.
- Prompt mode has no text input and exposes no shader sliders.
- Prompt mode must not load PNG/image assets, create the face tracker, call AI/API services, or use Canvas2D/getImageData/putImageData.
- Existing camera, hand tracking, quadrilateral mapping, smoothing, fade, mask, and mirror behavior remain shared and unchanged.
- The original camera always renders outside the quadrilateral.
- The prompt shader is one fragment pass with at most thirteen texture reads per output fragment.
- Prompt preset constants are RGB levels 6, luminance bands 4, saturation 1.12, contrast 1.08, edge thresholds 0.08/0.22, edge strength 0.9, and warm ink near `(0.06, 0.035, 0.03)`.
- Pixi application resolution is capped at `min(window.devicePixelRatio, 1.5)`; prompt filter resolution is `1`.
- Target sustained prompt-mode performance is 30–60fps, with average below 30fps treated as a release blocker.
- Add no PNG, SVG, font, video, or other visual asset for prompt mode.

---

## File Structure

- Modify `src/types.ts`: add `FilterMode` and default mode while retaining common/current PNG settings.
- Modify `src/types.test.ts`: lock the exact two-mode contract and PNG default.
- Modify `src/App.tsx`: own selected mode and pass it to controls and stage.
- Modify `src/App.test.tsx`: verify mode state propagation and existing visibility/retry behavior.
- Modify `src/ui/Controls.tsx`: replace three sliders with two exclusive mode buttons; retain mirror and camera restart.
- Modify `src/ui/Controls.test.tsx`: verify selector semantics, removed sliders, common controls.
- Create `src/pixi/PromptCelFilter.ts`: fixed one-pass WebGL cel-anime shader.
- Create `src/pixi/PromptCelFilter.test.ts`: verify shader stages, constants, clamping, sample budget, and public API.
- Modify `src/pixi/HandFrameStage.tsx`: split shared video/hand resources from mode-owned PNG/face or prompt-filter resources.
- Modify `src/pixi/HandFrameStage.test.ts`: verify mode capabilities, rendering resolution, and unchanged quad/mirror helpers.
- Modify `src/styles.css`: style a compact, responsive two-option mode selector.

---

### Task 1: Add Mode State and Replace Slider Controls

**Files:**
- Modify: `src/types.ts`
- Modify: `src/types.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/ui/Controls.tsx`
- Modify: `src/ui/Controls.test.tsx`

**Interfaces:**
- Produces: `export type FilterMode = 'png' | 'prompt'` and `export const DEFAULT_FILTER_MODE: FilterMode = 'png'`.
- Produces: `ControlsProps = { mode: FilterMode; settings: FilterSettings; onModeChange(mode: FilterMode): void; onChange(settings: FilterSettings): void; onRestartCamera(): void }`.
- Produces: App-owned `mode` state; Task 3 consumes it through `HandFrameStage`.

- [ ] **Step 1: Write failing type and controls tests**

Update `src/types.test.ts`:

```ts
import { DEFAULT_FILTER_MODE, DEFAULT_FILTER_SETTINGS } from './types'

expect(DEFAULT_FILTER_MODE).toBe('png')
expect(DEFAULT_FILTER_SETTINGS.mirror).toBe(true)
```

Replace the slider-focused control test with:

```tsx
render(
  <Controls
    mode="png"
    settings={DEFAULT_FILTER_SETTINGS}
    onModeChange={onModeChange}
    onChange={onChange}
    onRestartCamera={onRestartCamera}
  />,
)

expect(screen.getByRole('group', { name: '필터 선택' })).toBeTruthy()
fireEvent.click(screen.getByRole('button', { name: '프롬프트 모드' }))
expect(onModeChange).toHaveBeenCalledWith('prompt')
expect(screen.queryByRole('slider')).toBeNull()
fireEvent.click(screen.getByRole('checkbox', { name: '미러' }))
expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTER_SETTINGS, mirror: false })
```

- [ ] **Step 2: Run focused tests and confirm the mode contract is absent**

Run: `npm test -- src/types.test.ts src/ui/Controls.test.tsx`

Expected: FAIL because `DEFAULT_FILTER_MODE`, mode props, and selector buttons do not exist.

- [ ] **Step 3: Implement the mode type and selector**

Add to `src/types.ts`:

```ts
export type FilterMode = 'png' | 'prompt'
export const DEFAULT_FILTER_MODE: FilterMode = 'png'
```

Remove the `Slider` component and render:

```tsx
<div className="controls__modes" role="group" aria-label="필터 선택">
  <button type="button" aria-pressed={mode === 'png'} onClick={() => onModeChange('png')}>
    <strong>PNG 모드</strong>
    <span>표정이 움직이는 애니메 얼굴</span>
  </button>
  <button type="button" aria-pressed={mode === 'prompt'} onClick={() => onModeChange('prompt')}>
    <strong>프롬프트 모드</strong>
    <span>실시간 셀 애니 카메라</span>
  </button>
</div>
```

Keep the mirror checkbox and camera-restart button below the selector.

- [ ] **Step 4: Own mode state in App and test propagation through controls**

Initialize:

```ts
const [mode, setMode] = useState<FilterMode>(DEFAULT_FILTER_MODE)
```

Pass `mode`/`setMode` into `Controls`. Update `src/App.test.tsx` to click `프롬프트 모드` and assert its `aria-pressed` becomes `true`. Do not pass the mode to `HandFrameStage` until Task 3, keeping this commit buildable without changing stage behavior.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- src/types.test.ts src/ui/Controls.test.tsx src/App.test.tsx`

Expected: PASS.

Run: `npm test`

Expected: all tests pass and existing tracker retry behavior remains covered.

- [ ] **Step 6: Commit the mode UI**

```bash
git add src/types.ts src/types.test.ts src/App.tsx src/App.test.tsx src/ui/Controls.tsx src/ui/Controls.test.tsx
git commit -m "PNG·프롬프트 필터 모드 선택 추가"
```

---

### Task 2: Implement the Fixed One-Pass Prompt Cel Shader

**Files:**
- Create: `src/pixi/PromptCelFilter.ts`
- Create: `src/pixi/PromptCelFilter.test.ts`

**Interfaces:**
- Produces: `export class PromptCelFilter extends Filter` with no mutable public preset setters.
- Produces: `export const PROMPT_CEL_SAMPLE_COUNT = 13` for a sample-budget assertion.

- [ ] **Step 1: Write the failing shader contract test**

Create `src/pixi/PromptCelFilter.test.ts` asserting:

```ts
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
```

- [ ] **Step 2: Run the test and verify the filter is missing**

Run: `npm test -- src/pixi/PromptCelFilter.test.ts`

Expected: FAIL because `PromptCelFilter` does not exist.

- [ ] **Step 3: Implement edge-preserving smoothing and color shaping**

Use `defaultFilterVert`, `GlProgram`, premultiplied-alpha undo/redo, and fixed constants. The smoothing center is:

```glsl
vec3 center = straightColor(texture(uTexture, vTextureCoord));
vec3 smoothColor = center;
float totalWeight = 1.0;
for each cardinal neighbor:
  float colorDistance = dot(neighbor - center, neighbor - center);
  float weight = exp(-colorDistance * 18.0);
  smoothColor += neighbor * weight;
  totalWeight += weight;
smoothColor /= totalWeight;
```

Apply saturation around luminance by `1.12`, contrast around `0.5` by `1.08`, then quantize RGB with `floor(color * 6.0 + 0.5) / 6.0`.

- [ ] **Step 4: Implement luminance bands and Sobel ink**

Sample the eight 3×3 neighbors with clamped coordinates. Use the standard Sobel `gx`/`gy`, name the gradient function `sobel`, and compute:

```glsl
float band = floor(luma * 4.0 + 0.5) / 4.0;
vec3 celColor = posterized * mix(0.68, 1.12, band);
float ink = smoothstep(0.08, 0.22, sobelGradient) * 0.9;
vec3 inkColor = vec3(0.06, 0.035, 0.03);
vec3 finalRgb = mix(celColor, inkColor, ink);
```

Clamp every sample coordinate to `uInputClamp`, return premultiplied alpha, set filter `resolution: 1`, and document that the center/cardinal values are reused so the declared total is thirteen reads.

- [ ] **Step 5: Run focused tests, typecheck, and commit**

Run: `npm test -- src/pixi/PromptCelFilter.test.ts src/pixi/CellShadeFilter.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS with the new shader compiled into the bundle.

```bash
git add src/pixi/PromptCelFilter.ts src/pixi/PromptCelFilter.test.ts
git commit -m "고정 WebGL 셀 애니 프롬프트 필터 추가"
```

---

### Task 3: Isolate Mode Resources While Preserving Shared Hand Tracking

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/pixi/HandFrameStage.tsx`
- Modify: `src/pixi/HandFrameStage.test.ts`

**Interfaces:**
- Consumes: `FilterMode` from Task 1 and `PromptCelFilter` from Task 2.
- Produces: `HandFrameStageProps.mode: FilterMode`.
- Produces: `export function capabilitiesForMode(mode: FilterMode): { animeAssets: boolean; faceTracking: boolean; promptFilter: boolean }`.
- Produces: `createModeResources(mode, loadAnimeTexture)` and `createFaceTrackerForMode(mode, factory)` dependency boundaries whose prompt branches call neither injected factory.

- [ ] **Step 1: Write failing mode-capability and App propagation tests**

Add:

```ts
expect(capabilitiesForMode('png')).toEqual({
  animeAssets: true,
  faceTracking: true,
  promptFilter: false,
})
expect(capabilitiesForMode('prompt')).toEqual({
  animeAssets: false,
  faceTracking: false,
  promptFilter: true,
})

const loadAnimeTexture = vi.fn()
const promptResources = await createModeResources('prompt', loadAnimeTexture)
expect(promptResources.mode).toBe('prompt')
expect(loadAnimeTexture).not.toHaveBeenCalled()

const faceFactory = vi.fn()
expect(await createFaceTrackerForMode('prompt', faceFactory)).toBeNull()
expect(faceFactory).not.toHaveBeenCalled()
```

Update the mocked `StageProps` in `src/App.test.tsx` with `mode: FilterMode`, click the prompt button, and assert `mocks.stageProps.at(-1)?.mode === 'prompt'` without a camera restart.

- [ ] **Step 2: Run focused tests and verify missing integration fails**

Run: `npm test -- src/App.test.tsx src/pixi/HandFrameStage.test.ts`

Expected: FAIL because the stage has no mode prop or capability boundary.

- [ ] **Step 3: Split shared and mode-owned resources**

Keep one video texture effect keyed only by `video`. Add a mode resource union:

```ts
type ModeResources =
  | { mode: 'png'; filter: CellShadeFilter; animeTextures: Record<AnimeExpressionKey, Texture> }
  | { mode: 'prompt'; filter: PromptCelFilter }
```

The mode effect calls `createModeResources`. That function must branch before any `loadAnimeTexture`/`Assets.load` call. For `prompt`, construct only `new PromptCelFilter()`. For `png`, load `ANIME_FACE_ASSETS` and construct the current `CellShadeFilter`. Destroy only resources owned by the branch during cleanup.

- [ ] **Step 4: Separate face-tracker lifetime from the hand loop**

Keep hand tracker creation and `requestAnimationFrame` in an effect independent of `mode`. Store current mode in `modeRef`. Manage `faceTrackerRef` in a separate effect:

```ts
useEffect(() => {
  if (mode !== 'png') {
    faceTrackerRef.current?.close()
    faceTrackerRef.current = null
    return
  }
  let cancelled = false
  void createFaceTrackerForMode(mode).then((tracker) => {
    if (!tracker) return
    if (cancelled) tracker.close()
    else faceTrackerRef.current = tracker
  })
  return () => {
    cancelled = true
    faceTrackerRef.current?.close()
    faceTrackerRef.current = null
  }
}, [mode, trackerKey])
```

The hand loop calls face detection only when `modeRef.current === 'png'`; prompt mode resets the expression to neutral without creating or calling the face tracker. Switching modes must not call `restart()` and must not recreate `createHandTracker()`.

- [ ] **Step 5: Render each mode through the same quad mask**

Always render the original camera sprite first. Under an active gesture:

- PNG: render the current filtered-camera underlay at alpha `gesture.alpha * 0.35`, then the expression texture as today.
- Prompt: render one camera sprite using `PromptCelFilter`, the same `mask`, and alpha `gesture.alpha`; do not render `animeTexture`.

Keep `mapQuadToStage`, `spriteScale`, mask drawing, and mirror rotation unchanged.

- [ ] **Step 6: Cap Pixi rendering resolution and run integration tests**

Set:

```tsx
resolution={Math.min(window.devicePixelRatio, 1.5)}
```

Run: `npm test -- src/App.test.tsx src/pixi/HandFrameStage.test.ts src/tracking/frameGesture.test.ts`

Expected: PASS for mode propagation, capability boundaries, quad mapping, mirror mapping, and gesture behavior.

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit mode-isolated rendering**

```bash
git add src/App.tsx src/App.test.tsx src/pixi/HandFrameStage.tsx src/pixi/HandFrameStage.test.ts
git commit -m "손 프레임 렌더링을 PNG·프롬프트 모드로 분리"
```

---

### Task 4: Responsive Polish and Full Browser Verification

**Files:**
- Modify: `src/styles.css`
- Modify prior scoped files only when a failing automated or browser check identifies a concrete defect.

**Interfaces:**
- Consumes: completed selector and rendering modes.
- Produces: responsive controls and a verified branch.

- [ ] **Step 1: Style the mode selector for desktop and mobile**

Use a two-row grid with clear selected state:

```css
.controls__modes {
  display: grid;
  gap: 0.5rem;
}

.controls__modes button[aria-pressed='true'] {
  border-color: rgb(255 184 72 / 85%);
  background: rgb(255 158 32 / 18%);
}
```

Keep the panel within `min(20rem, calc(100% - 2rem))`, ensure buttons are at least 44px high, and at `max-width: 640px` reduce top/right/padding without covering the center status message.

- [ ] **Step 2: Run all automated gates**

Run: `npm test`

Expected: all Vitest tests pass.

Run: `npm run lint`

Expected: zero oxlint errors.

Run: `npm run build`

Expected: TypeScript and Vite production build pass.

Run: `npm run assets:anime:verify`

Expected: PNG mode's eight existing assets remain valid and byte-reproducible; prompt mode added no asset.

- [ ] **Step 3: Verify PNG mode in a real browser**

Start: `npm run dev -- --host 127.0.0.1`

Grant camera permission, create the hand quadrilateral, and verify the PNG avatar still follows face pose and expression. Toggle mirror and confirm the existing mapping remains correct.

- [ ] **Step 4: Verify prompt mode appearance and boundaries**

Select `프롬프트 모드` and verify:

1. No anime avatar appears.
2. Outside the hand quadrilateral remains original camera footage.
3. Inside the quadrilateral shows flattened colors, six-step posterization, four-band light/shadow, warm dark contours, and higher saturation/contrast.
4. Skin texture does not become dense ink noise.
5. Translation, scale, rotation, mirror, and fade follow the existing hand frame.
6. Switching into prompt mode triggers no additional PNG/image request; the automated injected-loader test is the authoritative proof that the prompt resource branch cannot request an anime asset. Initial page load may request PNG assets because PNG is the required default mode.

- [ ] **Step 5: Measure sustained prompt-mode frame cadence**

With the hand frame active for at least 10 seconds, record `requestAnimationFrame` timestamps in the browser performance console or DevTools performance capture. Calculate `frames / elapsedSeconds`; expected average is at least 30fps. Also verify no repeated long task over 100ms originates from CPU pixel manipulation.

- [ ] **Step 6: Check narrow mobile layout**

Use a 390×844 viewport. Verify both mode buttons, mirror, restart, and center status remain reachable without horizontal scrolling or overlap.

- [ ] **Step 7: Review final diff and commit polish/fixes**

Run: `git diff --check`

Run: `git status --short`

If only `src/styles.css` changed:

```bash
git add src/styles.css
git commit -m "필터 모드 선택 UI를 모바일에 맞게 정리"
```

If browser verification required scoped fixes, stage only the named files changed by those fixes and use a commit subject that states the corrected behavior.
