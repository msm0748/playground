# Anime Wink Matching and Alpha Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the anime overlay wink the same anatomical eye as the user, preserve mouth combinations, and replace all expression PNGs with registered 1024×1024 assets whose hair gaps and edges have clean alpha.

**Architecture:** Keep MediaPipe anatomical blink scores separate through the tracking pipeline and select one of eight whole-frame textures with per-channel hysteresis. Build the four new wink frames deterministically from the existing registered artwork with a small Swift/CoreGraphics asset tool; the same tool creates one cleaned alpha silhouette and applies it to every frame so expression changes cannot shift the character.

**Tech Stack:** TypeScript 6, React 19, PixiJS 8, MediaPipe Tasks Vision, Vitest 4, Swift 6 with CoreGraphics/ImageIO for deterministic PNG processing.

## Global Constraints

- Left and right always mean anatomical MediaPipe labels, never raw screen coordinates.
- Do not swap wink keys when `settings.mirror` changes; the existing sprite transform owns mirroring.
- Keep every anime asset exactly 1024×1024 with alpha and the current character registration.
- Preserve the existing face pose, hand-frame mask, scale, rotation, palette, hairstyle, and expression artwork outside the edited eye regions.
- Do not add an npm image-processing dependency or regenerate the entire character.
- Full blink wins when both eyes are closed; mouth opening selects the corresponding mouth variant.

---

## File Structure

- Modify `src/tracking/faceTracker.ts`: expose anatomical eye scores and choose eight expression states with independent hysteresis.
- Modify `src/tracking/faceTracker.test.ts`: pin blendshape extraction, left/right selection, full blink precedence, mouth combinations, and hysteresis.
- Modify `src/pixi/HandFrameStage.tsx`: register four wink texture paths and cache revisions.
- Modify `src/pixi/HandFrameStage.test.ts`: verify all expression assets are present and mirror mode remains a sprite transform concern.
- Create `scripts/build-anime-face-assets.swift`: load RGBA PNGs, clean a shared alpha matte, feather-copy one closed eye at a time, and write four cleaned sources plus four wink frames.
- Create `scripts/verify-anime-face-assets.swift`: fail unless all eight assets are RGBA, 1024×1024, share the same cleaned silhouette, and contain transparent corner pixels.
- Modify `package.json`: add reproducible `assets:anime` and `assets:anime:verify` scripts.
- Create `public/anime-face-wink-left.png`, `public/anime-face-wink-right.png`, `public/anime-face-wink-left-mouth.png`, and `public/anime-face-wink-right-mouth.png`.
- Modify the four existing `public/anime-face-*.png` files in place only through the asset builder.

---

### Task 1: Preserve Anatomical Eye Scores

**Files:**
- Modify: `src/tracking/faceTracker.test.ts`
- Modify: `src/tracking/faceTracker.ts`

**Interfaces:**
- Consumes: MediaPipe category names `eyeBlinkLeft`, `eyeBlinkRight`, and `jawOpen`.
- Produces: `FaceExpression = { blinkLeft: number; blinkRight: number; jawOpen: number }`.

- [ ] **Step 1: Write the failing blendshape extraction test**

Replace the existing combined-blink assertion with:

```ts
expect(
  expressionFromBlendshapes([
    { categoryName: 'eyeBlinkLeft', score: 0.2 },
    { categoryName: 'eyeBlinkRight', score: 0.8 },
    { categoryName: 'jawOpen', score: 0.55 },
  ]),
).toEqual({ blinkLeft: 0.2, blinkRight: 0.8, jawOpen: 0.55 })
```

- [ ] **Step 2: Run the focused test and confirm the old model fails**

Run: `npm test -- src/tracking/faceTracker.test.ts`

Expected: FAIL because the current result contains `blink` instead of `blinkLeft` and `blinkRight`.

- [ ] **Step 3: Implement the anatomical expression type**

Change the type and extractor to:

```ts
export type FaceExpression = {
  blinkLeft: number
  blinkRight: number
  jawOpen: number
}

return {
  blinkLeft: scoreByName(categories, 'eyeBlinkLeft'),
  blinkRight: scoreByName(categories, 'eyeBlinkRight'),
  jawOpen: scoreByName(categories, 'jawOpen'),
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/tracking/faceTracker.test.ts`

Expected: the extraction test passes; selection tests may fail until Task 2 updates their fixtures.

- [ ] **Step 5: Commit the tracker data-model change**

```bash
git add src/tracking/faceTracker.ts src/tracking/faceTracker.test.ts
git commit -m "얼굴 추적에서 좌우 눈 감김 점수 분리"
```

---

### Task 2: Select Eight Stable Expression States

**Files:**
- Modify: `src/tracking/faceTracker.test.ts`
- Modify: `src/tracking/faceTracker.ts`

**Interfaces:**
- Consumes: `FaceExpression` from Task 1 and the previous `AnimeExpressionKey`.
- Produces: `AnimeExpressionKey = 'neutral' | 'winkLeft' | 'winkRight' | 'blink' | 'mouth' | 'winkLeftMouth' | 'winkRightMouth' | 'blinkMouth'` and `selectAnimeExpression(expression, previous)`.

- [ ] **Step 1: Write the failing expression table tests**

Add a table that includes every state:

```ts
it.each([
  [{ blinkLeft: 0.1, blinkRight: 0.1, jawOpen: 0.1 }, 'neutral'],
  [{ blinkLeft: 0.7, blinkRight: 0.1, jawOpen: 0.1 }, 'winkLeft'],
  [{ blinkLeft: 0.1, blinkRight: 0.7, jawOpen: 0.1 }, 'winkRight'],
  [{ blinkLeft: 0.7, blinkRight: 0.7, jawOpen: 0.1 }, 'blink'],
  [{ blinkLeft: 0.1, blinkRight: 0.1, jawOpen: 0.6 }, 'mouth'],
  [{ blinkLeft: 0.7, blinkRight: 0.1, jawOpen: 0.6 }, 'winkLeftMouth'],
  [{ blinkLeft: 0.1, blinkRight: 0.7, jawOpen: 0.6 }, 'winkRightMouth'],
  [{ blinkLeft: 0.7, blinkRight: 0.7, jawOpen: 0.6 }, 'blinkMouth'],
] as const)('selects %s as %s', (expression, expected) => {
  expect(selectAnimeExpression(expression)).toBe(expected)
})
```

Add independent release checks:

```ts
expect(
  selectAnimeExpression(
    { blinkLeft: 0.4, blinkRight: 0.1, jawOpen: 0.1 },
    'winkLeft',
  ),
).toBe('winkLeft')
expect(
  selectAnimeExpression(
    { blinkLeft: 0.1, blinkRight: 0.1, jawOpen: 0.1 },
    'winkLeft',
  ),
).toBe('neutral')
```

- [ ] **Step 2: Run the focused test and verify missing keys fail**

Run: `npm test -- src/tracking/faceTracker.test.ts`

Expected: FAIL because wink keys and independent eye hysteresis do not exist.

- [ ] **Step 3: Implement independent hysteresis and state composition**

Use small helpers so each previous state decodes consistently:

```ts
const LEFT_CLOSED = new Set<AnimeExpressionKey>([
  'winkLeft', 'blink', 'winkLeftMouth', 'blinkMouth',
])
const RIGHT_CLOSED = new Set<AnimeExpressionKey>([
  'winkRight', 'blink', 'winkRightMouth', 'blinkMouth',
])
const MOUTH_OPEN = new Set<AnimeExpressionKey>([
  'mouth', 'winkLeftMouth', 'winkRightMouth', 'blinkMouth',
])

function held(score: number, wasOn: boolean, on: number, off: number): boolean {
  if (score >= on) return true
  if (score <= off) return false
  return wasOn
}
```

Evaluate both eyes with `on = 0.5`, `off = 0.22`, and the mouth with `on = 0.35`, `off = 0.15`. Compose the key with both-eyes-closed precedence, then one-eye states, then mouth-only/neutral.

- [ ] **Step 4: Run the tracking suite**

Run: `npm test -- src/tracking/faceTracker.test.ts`

Expected: PASS for extraction, all eight states, blink precedence, and hysteresis.

- [ ] **Step 5: Commit expression selection**

```bash
git add src/tracking/faceTracker.ts src/tracking/faceTracker.test.ts
git commit -m "실제 눈과 대응하는 좌우 윙크 상태 선택"
```

---

### Task 3: Build Registered Wink and Clean-Alpha Assets

**Files:**
- Create: `scripts/build-anime-face-assets.swift`
- Create: `scripts/verify-anime-face-assets.swift`
- Modify: `package.json`
- Modify: `public/anime-face-overlay.png`
- Modify: `public/anime-face-eyes-closed.png`
- Modify: `public/anime-face-mouth-open.png`
- Modify: `public/anime-face-blink-mouth.png`
- Create: `public/anime-face-wink-left.png`
- Create: `public/anime-face-wink-right.png`
- Create: `public/anime-face-wink-left-mouth.png`
- Create: `public/anime-face-wink-right-mouth.png`

**Interfaces:**
- Consumes: four existing registered 1024×1024 RGBA source frames.
- Produces: the eight exact asset paths listed above with one shared alpha channel.

- [ ] **Step 1: Add the failing verifier first**

Implement `scripts/verify-anime-face-assets.swift` with ImageIO. It must load the eight fixed paths and exit nonzero unless each image satisfies:

```swift
guard width == 1024, height == 1024 else { fail("\(path): expected 1024x1024") }
guard bitsPerPixel == 32 else { fail("\(path): expected RGBA") }
guard alphaAt(0, 0) == 0,
      alphaAt(1023, 0) == 0,
      alphaAt(0, 1023) == 0,
      alphaAt(1023, 1023) == 0 else {
  fail("\(path): corners must be transparent")
}
guard alphaBytes == referenceAlphaBytes else {
  fail("\(path): silhouette differs from anime-face-overlay.png")
}
```

Add scripts to `package.json`:

```json
"assets:anime": "swift scripts/build-anime-face-assets.swift",
"assets:anime:verify": "swift scripts/verify-anime-face-assets.swift"
```

- [ ] **Step 2: Run verification and confirm missing wink assets fail**

Run: `npm run assets:anime:verify`

Expected: FAIL naming `public/anime-face-wink-left.png` as missing.

- [ ] **Step 3: Implement deterministic RGBA loading and saving**

In `build-anime-face-assets.swift`, define:

```swift
struct RGBAImage {
  let width: Int
  let height: Int
  var pixels: [UInt8]

  func offset(x: Int, y: Int) -> Int { (y * width + x) * 4 }
}

func loadPNG(_ path: String) throws -> RGBAImage
func writePNG(_ image: RGBAImage, to path: String) throws
```

Decode with `CGImageSourceCreateWithURL`, draw into an 8-bit premultiplied-last RGBA bitmap context, and encode with `CGImageDestinationCreateWithURL(..., UTType.png.identifier, 1, nil)`.

- [ ] **Step 4: Build one clean shared alpha matte**

Derive the matte from `anime-face-overlay.png` and apply these exact rules:

```swift
let faceKeepEllipse = Ellipse(cx: 512, cy: 565, rx: 285, ry: 330)
let isNeutralResidue = min(r, g, b) >= 185 && max(r, g, b) - min(r, g, b) <= 35
if !faceKeepEllipse.contains(x, y) && isNeutralResidue { alpha = 0 }
if alpha <= 8 { alpha = 0 }
```

Contract only partially transparent outer-edge pixels by one 3×3 minimum-filter pass, then feather that matte with a 0.25-pixel equivalent linear blend. Do not contract fully opaque interior pixels. Copy the resulting alpha bytes to all eight output frames and zero RGB when alpha becomes zero.

- [ ] **Step 5: Composite one closed eye at a time**

Use anatomical asset coordinates (the character faces the viewer):

```swift
let anatomicalLeft = EyePatch(cx: 646, cy: 558, rx: 128, ry: 92)
let anatomicalRight = EyePatch(cx: 378, cy: 558, rx: 128, ry: 92)
```

For each pixel inside an eye ellipse, feather source-over blending from 0 at the ellipse edge to 1 by the inner 12 pixels. Produce:

```swift
buildWink(base: neutral, closed: blink, patch: anatomicalLeft)       // wink-left
buildWink(base: neutral, closed: blink, patch: anatomicalRight)      // wink-right
buildWink(base: mouth, closed: blinkMouth, patch: anatomicalLeft)    // wink-left-mouth
buildWink(base: mouth, closed: blinkMouth, patch: anatomicalRight)   // wink-right-mouth
```

Save cleaned copies of the four sources and the four composites only after all eight in-memory images validate.

- [ ] **Step 6: Generate and verify assets**

Run: `npm run assets:anime`

Expected: eight PNGs are written, each reported as `1024x1024 RGBA`.

Run: `npm run assets:anime:verify`

Expected: PASS with `Verified 8 anime face assets with shared alpha`.

- [ ] **Step 7: Inspect all eight on light and dark backgrounds**

Run: `npm run dev -- --host 127.0.0.1`

Open the app, trigger each eye and mouth combination, and verify no white/gray residue remains in hair gaps or below the curls. If the eye-patch feather edge is visible, adjust only `rx`, `ry`, or the 12-pixel feather band, regenerate, and rerun verification.

- [ ] **Step 8: Commit reproducible assets**

```bash
git add package.json scripts/build-anime-face-assets.swift scripts/verify-anime-face-assets.swift public/anime-face-overlay.png public/anime-face-eyes-closed.png public/anime-face-mouth-open.png public/anime-face-blink-mouth.png public/anime-face-wink-left.png public/anime-face-wink-right.png public/anime-face-wink-left-mouth.png public/anime-face-wink-right-mouth.png
git commit -m "정렬된 윙크 프레임과 깨끗한 투명 배경 생성"
```

---

### Task 4: Register Wink Textures Without Swapping Mirror Sides

**Files:**
- Modify: `src/pixi/HandFrameStage.test.ts`
- Modify: `src/pixi/HandFrameStage.tsx`

**Interfaces:**
- Consumes: all eight `AnimeExpressionKey` values and PNGs from Tasks 2–3.
- Produces: `ANIME_FACE_ASSETS: Record<AnimeExpressionKey, string>` with a valid URL for every key.

- [ ] **Step 1: Export the asset map and write a failing completeness test**

Add this assertion:

```ts
expect(ANIME_FACE_ASSETS).toEqual({
  neutral: '/anime-face-overlay.png?v=4',
  blink: '/anime-face-eyes-closed.png?v=2',
  mouth: '/anime-face-mouth-open.png?v=2',
  blinkMouth: '/anime-face-blink-mouth.png?v=2',
  winkLeft: '/anime-face-wink-left.png?v=1',
  winkRight: '/anime-face-wink-right.png?v=1',
  winkLeftMouth: '/anime-face-wink-left-mouth.png?v=1',
  winkRightMouth: '/anime-face-wink-right-mouth.png?v=1',
})
```

Retain the existing mirror transform tests; do not introduce a function that swaps `winkLeft` and `winkRight`.

- [ ] **Step 2: Run the Pixi stage test and confirm missing paths fail**

Run: `npm test -- src/pixi/HandFrameStage.test.ts`

Expected: FAIL because `ANIME_FACE_ASSETS` is not exported and contains only four keys.

- [ ] **Step 3: Expand and export the asset map**

Implement exactly the eight-entry map asserted above. Leave texture loading and `settings.mirror ? -1 : 1` sprite scale unchanged.

- [ ] **Step 4: Run focused tracking and stage tests**

Run: `npm test -- src/tracking/faceTracker.test.ts src/pixi/HandFrameStage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit renderer registration**

```bash
git add src/pixi/HandFrameStage.tsx src/pixi/HandFrameStage.test.ts
git commit -m "픽시 렌더러에 좌우 윙크 텍스처 연결"
```

---

### Task 5: Full Verification and Camera Acceptance Test

**Files:**
- Verify only; modify prior files only if a failing check identifies a scoped defect.

**Interfaces:**
- Consumes: completed tracking, assets, and renderer integration.
- Produces: a verified branch ready for review.

- [ ] **Step 1: Verify generated assets are reproducible**

Run: `npm run assets:anime`

Run: `git status --short`

Expected: no PNG diff after regeneration.

Run: `npm run assets:anime:verify`

Expected: PASS for all eight assets.

- [ ] **Step 2: Run all automated checks**

Run: `npm test`

Expected: all Vitest tests pass.

Run: `npm run lint`

Expected: zero oxlint errors.

Run: `npm run build`

Expected: TypeScript and Vite production build succeed.

- [ ] **Step 3: Exercise the real camera flow**

Start: `npm run dev -- --host 127.0.0.1`

Verify in the browser:

1. Left eye only → character anatomical left wink.
2. Right eye only → character anatomical right wink.
3. Both eyes → full blink.
4. Repeat 1–3 with the mouth open.
5. Toggle mirror off and on; tracking labels stay anatomical while the whole image flips with the video.
6. View the character over both light and dark camera regions; no trapped background, white lower-curl blobs, or gray edge halo appears.
7. Rapidly hover around a wink threshold; the texture does not flicker.

- [ ] **Step 4: Review the final diff and commit only scoped fixes if needed**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors and no uncommitted generated drift. If verification required a scoped correction, stage only its named files and use a message describing that correction.
