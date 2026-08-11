# Hand Frame Cell Shade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React + PixiJS webcam demo where a two-hand L “viewfinder” gesture reveals a cell-shaded region with border, fade, and controls.

**Architecture:** Hidden `<video>` feeds MediaPipe `HandLandmarker` and a PixiJS stage. `FrameGesture` turns landmarks into a smoothed rect + idle/active/fading state. The stage draws raw video full-bleed, a masked duplicate with `CellShadeFilter`, and a border `Graphics`. React owns camera permission, settings, and status UI.

**Tech Stack:** Vite, React 19, TypeScript, pnpm, Vitest, PixiJS v8, `@pixi/react`, `@mediapipe/tasks-vision`

**Spec:** `docs/superpowers/specs/2026-08-11-hand-frame-cell-shade-design.md`

## Global Constraints

- Package manager: **pnpm only** (never npm/yarn)
- Desktop Chrome/Edge first; horizontal mirror **on by default**
- Gesture: both hands L-frame; reject if side &lt; **8%** of shorter video dim or aspect outside **1:3…3:1**
- Smoothing: `smoothed = lerp(smoothed, raw, 0.35)` per detection frame
- Fade: **250ms** linear alpha on effect + border
- Filter uniforms: `levels`, `edgeStrength`, `tint` — no AI stylization
- UI copy for idle hint: `양손으로 프레임을 만들어 보세요`
- Commit messages: **Korean**
- No recording, mobile optimization, multi-style presets, or backend

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html` | Tooling; Vitest via Vite |
| `src/main.tsx`, `src/App.tsx`, `src/styles.css` | App shell |
| `src/types.ts` | Shared rect / gesture / settings types |
| `src/tracking/landmarks.ts` | MediaPipe landmark index constants + helpers |
| `src/tracking/frameGesture.ts` | Pure L-frame detection, AABB, smoothing, state machine |
| `src/tracking/frameGesture.test.ts` | Unit tests for gesture logic |
| `src/tracking/handTracker.ts` | MediaPipe load + `detectForVideo` wrapper |
| `src/camera/useCamera.ts` | `getUserMedia`, stream lifecycle, errors |
| `src/pixi/extendPixi.ts` | `@pixi/react` `extend({ Sprite, Graphics, Container })` |
| `src/pixi/CellShadeFilter.ts` | Custom PixiJS v8 `Filter` (quantize + edges) |
| `src/pixi/HandFrameStage.tsx` | Pixi scene + ticker sync with video/tracker |
| `src/ui/Controls.tsx` | Sliders + mirror + camera restart |
| `src/ui/StatusOverlay.tsx` | Permission / loading / hint / error UI |
| `public/` | Optional local assets (none required; CDN models OK) |

---

### Task 1: Scaffold Vite React + Vitest

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/vite-env.d.ts`, `src/types.ts`
- Test: verify `pnpm test` runs (empty/pass stub ok until Task 2)

**Interfaces:**
- Consumes: nothing
- Produces: runnable Vite app; shared types below

- [ ] **Step 1: Scaffold and install deps**

```bash
cd /Users/seokmin/Desktop/develop/playground
pnpm create vite . --template react-ts
pnpm install
pnpm add pixi.js @pixi/react @mediapipe/tasks-vision
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

If create-vite refuses non-empty dir (docs already present), create in a temp folder and move `package.json` / `src` / configs into the repo root, keeping `docs/`.

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Add shared types in `src/types.ts`**

```ts
export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type GesturePhase = 'idle' | 'active' | 'fading'

export type GestureResult = {
  phase: GesturePhase
  rect: Rect | null
  alpha: number
}

export type FilterSettings = {
  levels: number
  edgeStrength: number
  tint: number
  mirror: boolean
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  levels: 5,
  edgeStrength: 0.65,
  tint: 0.1,
  mirror: true,
}
```

- [ ] **Step 4: Minimal App shell**

`src/App.tsx` renders a title `Hand Frame Cell Shade` and placeholder text. `src/styles.css`: full-viewport dark-neutral layout (not purple gradient), `#root` height 100%.

- [ ] **Step 5: Verify**

```bash
pnpm test
pnpm run build
```

Expected: tests exit 0 (no tests or pass); build succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig*.json index.html src
git commit -m "$(cat <<'EOF'
Vite React 프로젝트와 공유 타입 스캐폴딩

Pixi·MediaPipe·Vitest 의존성을 추가하고 셀 쉐이딩 데모 기반을 마련한다.
EOF
)"
```

---

### Task 2: FrameGesture (TDD)

**Files:**
- Create: `src/tracking/landmarks.ts`, `src/tracking/frameGesture.ts`, `src/tracking/frameGesture.test.ts`

**Interfaces:**
- Consumes: `Rect`, `GesturePhase`, `GestureResult` from `src/types.ts`
- Produces:
  - `export type LandmarkPoint = { x: number; y: number; z?: number }`
  - `export type HandSample = { handedness: 'Left' | 'Right'; landmarks: LandmarkPoint[] }`
  - `export function createFrameGesture(options?: { fadeMs?: number; lerpAlpha?: number }): { update(hands: HandSample[], videoSize: { width: number; height: number }, nowMs: number): GestureResult; reset(): void }`

- [ ] **Step 1: Write failing tests in `src/tracking/frameGesture.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { createFrameGesture, type HandSample } from './frameGesture'

/** 21 points; only tips/joints we care about need real values */
function hand(
  handedness: 'Left' | 'Right',
  tips: { index: [number, number]; thumb: [number, number] },
): HandSample {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  // MediaPipe indices
  landmarks[0] = { x: tips.thumb[0], y: tips.thumb[1] + 0.15 } // wrist-ish
  landmarks[4] = { x: tips.thumb[0], y: tips.thumb[1] } // thumb tip
  landmarks[3] = { x: tips.thumb[0], y: tips.thumb[1] + 0.04 }
  landmarks[8] = { x: tips.index[0], y: tips.index[1] } // index tip
  landmarks[6] = { x: tips.index[0], y: tips.index[1] + 0.05 } // index PIP closer to wrist → extended
  landmarks[5] = { x: tips.index[0], y: tips.index[1] + 0.08 }
  // curl middle/ring/pinky: tip closer to palm than PIP
  for (const tip of [12, 16, 20]) {
    landmarks[tip] = { x: tips.index[0], y: 0.55 }
    landmarks[tip - 2] = { x: tips.index[0], y: 0.45 }
  }
  return { handedness, landmarks }
}

describe('createFrameGesture', () => {
  it('stays idle with fewer than two hands', () => {
    const g = createFrameGesture()
    const r = g.update([], { width: 1280, height: 720 }, 0)
    expect(r.phase).toBe('idle')
    expect(r.rect).toBeNull()
    expect(r.alpha).toBe(0)
  })

  it('activates on two-hand L frame and returns AABB of tips', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const left = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const right = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    const r = g.update([left, right], { width: 1000, height: 1000 }, 0)
    expect(r.phase).toBe('active')
    expect(r.alpha).toBe(1)
    expect(r.rect).not.toBeNull()
    expect(r.rect!.x).toBeCloseTo(300, 0)
    expect(r.rect!.y).toBeCloseTo(300, 0)
    expect(r.rect!.width).toBeCloseTo(400, 0)
    expect(r.rect!.height).toBeCloseTo(250, 0)
  })

  it('rejects frames that are too small', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const left = hand('Left', { index: [0.49, 0.49], thumb: [0.49, 0.51] })
    const right = hand('Right', { index: [0.51, 0.49], thumb: [0.51, 0.51] })
    const r = g.update([left, right], { width: 1000, height: 1000 }, 0)
    expect(r.phase).toBe('idle')
  })

  it('enters fading then idle after gesture lost', () => {
    const g = createFrameGesture({ fadeMs: 250, lerpAlpha: 1 })
    const left = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const right = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    expect(g.update([left, right], { width: 1000, height: 1000 }, 0).phase).toBe('active')
    const mid = g.update([], { width: 1000, height: 1000 }, 100)
    expect(mid.phase).toBe('fading')
    expect(mid.rect).not.toBeNull()
    expect(mid.alpha).toBeGreaterThan(0)
    expect(mid.alpha).toBeLessThan(1)
    const done = g.update([], { width: 1000, height: 1000 }, 250)
    expect(done.phase).toBe('idle')
    expect(done.alpha).toBe(0)
    expect(done.rect).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test src/tracking/frameGesture.test.ts
```

Expected: FAIL (module / exports missing).

- [ ] **Step 3: Implement `src/tracking/landmarks.ts`**

```ts
export const WRIST = 0
export const THUMB_TIP = 4
export const INDEX_TIP = 8
export const INDEX_PIP = 6
export const MIDDLE_TIP = 12
export const MIDDLE_PIP = 10
export const RING_TIP = 16
export const RING_PIP = 14
export const PINKY_TIP = 20
export const PINKY_PIP = 18

export function dist2(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
```

- [ ] **Step 4: Implement `src/tracking/frameGesture.ts`**

```ts
import type { GestureResult, Rect } from '../types'
import {
  INDEX_PIP,
  INDEX_TIP,
  MIDDLE_PIP,
  MIDDLE_TIP,
  PINKY_PIP,
  PINKY_TIP,
  RING_PIP,
  RING_TIP,
  THUMB_TIP,
  WRIST,
  dist2,
} from './landmarks'

export type LandmarkPoint = { x: number; y: number; z?: number }
export type HandSample = {
  handedness: 'Left' | 'Right'
  landmarks: LandmarkPoint[]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function isFingerExtended(
  landmarks: LandmarkPoint[],
  tip: number,
  pip: number,
): boolean {
  const wrist = landmarks[WRIST]
  return dist2(landmarks[tip], wrist) > dist2(landmarks[pip], wrist)
}

function isFingerCurled(
  landmarks: LandmarkPoint[],
  tip: number,
  pip: number,
): boolean {
  const wrist = landmarks[WRIST]
  return dist2(landmarks[tip], wrist) < dist2(landmarks[pip], wrist)
}

function isLHand(hand: HandSample): boolean {
  const lm = hand.landmarks
  if (lm.length < 21) return false
  const indexUp = isFingerExtended(lm, INDEX_TIP, INDEX_PIP)
  const thumbOut = isFingerExtended(lm, THUMB_TIP, 3)
  const othersIn =
    isFingerCurled(lm, MIDDLE_TIP, MIDDLE_PIP) &&
    isFingerCurled(lm, RING_TIP, RING_PIP) &&
    isFingerCurled(lm, PINKY_TIP, PINKY_PIP)
  return indexUp && thumbOut && othersIn
}

function tipsRect(
  left: HandSample,
  right: HandSample,
  width: number,
  height: number,
): Rect {
  const pts = [
    left.landmarks[INDEX_TIP],
    left.landmarks[THUMB_TIP],
    right.landmarks[INDEX_TIP],
    right.landmarks[THUMB_TIP],
  ]
  const xs = pts.map((p) => p.x * width)
  const ys = pts.map((p) => p.y * height)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function isValidRect(rect: Rect, videoW: number, videoH: number): boolean {
  const minSide = Math.min(videoW, videoH) * 0.08
  if (rect.width < minSide || rect.height < minSide) return false
  const aspect = rect.width / Math.max(rect.height, 1e-6)
  return aspect >= 1 / 3 && aspect <= 3
}

export function createFrameGesture(options?: {
  fadeMs?: number
  lerpAlpha?: number
}) {
  const fadeMs = options?.fadeMs ?? 250
  const lerpAlpha = options?.lerpAlpha ?? 0.35

  let phase: GestureResult['phase'] = 'idle'
  let smoothed: Rect | null = null
  let fadeStartMs: number | null = null
  let lastRect: Rect | null = null

  function reset() {
    phase = 'idle'
    smoothed = null
    fadeStartMs = null
    lastRect = null
  }

  function update(
    hands: HandSample[],
    videoSize: { width: number; height: number },
    nowMs: number,
  ): GestureResult {
    const left = hands.find((h) => h.handedness === 'Left')
    const right = hands.find((h) => h.handedness === 'Right')
    const framing =
      !!left &&
      !!right &&
      isLHand(left) &&
      isLHand(right) &&
      isValidRect(
        tipsRect(left, right, videoSize.width, videoSize.height),
        videoSize.width,
        videoSize.height,
      )

    if (framing && left && right) {
      const raw = tipsRect(left, right, videoSize.width, videoSize.height)
      if (!smoothed) smoothed = { ...raw }
      else {
        smoothed = {
          x: lerp(smoothed.x, raw.x, lerpAlpha),
          y: lerp(smoothed.y, raw.y, lerpAlpha),
          width: lerp(smoothed.width, raw.width, lerpAlpha),
          height: lerp(smoothed.height, raw.height, lerpAlpha),
        }
      }
      phase = 'active'
      fadeStartMs = null
      lastRect = { ...smoothed }
      return { phase, rect: lastRect, alpha: 1 }
    }

    if (phase === 'active' || phase === 'fading') {
      if (fadeStartMs === null) fadeStartMs = nowMs
      const t = Math.min(1, (nowMs - fadeStartMs) / fadeMs)
      const alpha = 1 - t
      if (t >= 1) {
        reset()
        return { phase: 'idle', rect: null, alpha: 0 }
      }
      phase = 'fading'
      return { phase, rect: lastRect, alpha }
    }

    return { phase: 'idle', rect: null, alpha: 0 }
  }

  return { update, reset }
}
```

Tune `isLHand` if synthetic fixtures fail: prefer slightly looser curl checks so tests pass, then tighten with comments.

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm test src/tracking/frameGesture.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tracking
git commit -m "$(cat <<'EOF'
양손 L 프레임 제스처 로직과 단위 테스트 추가

AABB·최소 크기·페이드 상태 전환을 순수 함수로 고정한다.
EOF
)"
```

---

### Task 3: Camera hook

**Files:**
- Create: `src/camera/useCamera.ts`
- Modify: `src/App.tsx` (temporary: show video + start button for manual check)

**Interfaces:**
- Consumes: nothing from tracking
- Produces:
  - `export type CameraState = { status: 'idle' | 'requesting' | 'live' | 'error'; errorMessage: string | null }`
  - `export function useCamera(): { videoRef: RefObject<HTMLVideoElement | null>; state: CameraState; start: () => Promise<void>; stop: () => void; restart: () => Promise<void> }`

- [ ] **Step 1: Implement `src/camera/useCamera.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = {
  status: 'idle' | 'requesting' | 'live' | 'error'
  errorMessage: string | null
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({
    status: 'idle',
    errorMessage: null,
  })

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState({ status: 'idle', errorMessage: null })
  }, [])

  const start = useCallback(async () => {
    setState({ status: 'requesting', errorMessage: null })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element missing')
      video.srcObject = stream
      await video.play()
      setState({ status: 'live', errorMessage: null })
    } catch (e) {
      const message =
        e instanceof Error ? e.message : '카메라를 사용할 수 없습니다'
      setState({ status: 'error', errorMessage: message })
    }
  }, [])

  const restart = useCallback(async () => {
    stop()
    await start()
  }, [start, stop])

  useEffect(() => () => stop(), [stop])

  return { videoRef, state, start, stop, restart }
}
```

- [ ] **Step 2: Wire temporary preview in `App.tsx`**

Hidden-or-small `<video ref={videoRef} playsInline muted />`, button “카메라 허용” calling `start`, show `state.errorMessage` when error.

- [ ] **Step 3: Manual check**

```bash
pnpm dev
```

Expected: allow camera → live preview; deny → error + can retry.

- [ ] **Step 4: Commit**

```bash
git add src/camera src/App.tsx
git commit -m "$(cat <<'EOF'
웹캠 권한과 스트림 생명주기 훅 추가

허용·거부·재시도 상태를 UI에서 다룰 수 있게 한다.
EOF
)"
```

---

### Task 4: HandTracker wrapper

**Files:**
- Create: `src/tracking/handTracker.ts`

**Interfaces:**
- Consumes: `HandSample` from `frameGesture.ts`
- Produces:
  - `export async function createHandTracker(): Promise<HandTracker>`
  - `export type HandTracker = { detect(video: HTMLVideoElement, timestampMs: number): HandSample[]; close(): void }`

- [ ] **Step 1: Implement `src/tracking/handTracker.ts`**

```ts
import {
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision'
import type { HandSample } from './frameGesture'

const WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export type HandTracker = {
  detect: (video: HTMLVideoElement, timestampMs: number) => HandSample[]
  close: () => void
}

export async function createHandTracker(): Promise<HandTracker> {
  const vision = await FilesetResolver.forVisionTasks(WASM)
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  })

  return {
    detect(video, timestampMs) {
      if (video.readyState < 2) return []
      const result = landmarker.detectForVideo(video, timestampMs)
      const samples: HandSample[] = []
      for (let i = 0; i < result.landmarks.length; i++) {
        const category = result.handedness[i]?.[0]
        const label = category?.categoryName
        if (label !== 'Left' && label !== 'Right') continue
        samples.push({
          handedness: label,
          landmarks: result.landmarks[i].map((p) => ({
            x: p.x,
            y: p.y,
            z: p.z,
          })),
        })
      }
      return samples
    },
    close() {
      landmarker.close()
    },
  }
}
```

Pin `@mediapipe/tasks-vision` version in WASM URL to the installed package version if `latest` causes mismatch.

- [ ] **Step 2: Smoke-load from App (temporary)**

On camera `live`, `createHandTracker()` once; log `hands.length` in `requestAnimationFrame`. Remove console logging in Task 6 when stage owns the loop.

- [ ] **Step 3: Manual check**

`pnpm dev` → after model load, wave hands → console shows 1–2 hands. On load failure, surface error string for StatusOverlay later.

- [ ] **Step 4: Commit**

```bash
git add src/tracking/handTracker.ts src/App.tsx
git commit -m "$(cat <<'EOF'
MediaPipe HandLandmarker 래퍼 추가

비디오 프레임에서 양손 샘플을 추출할 수 있게 한다.
EOF
)"
```

---

### Task 5: CellShadeFilter

**Files:**
- Create: `src/pixi/CellShadeFilter.ts`, `src/pixi/extendPixi.ts`

**Interfaces:**
- Consumes: PixiJS v8 `Filter`, `GlProgram`
- Produces:
  - `export class CellShadeFilter extends Filter` with setters `levels`, `edgeStrength`, `tint` mapping to uniforms
  - `export function registerPixi(): void` calling `extend({ Container, Graphics, Sprite })`

- [ ] **Step 1: Implement `src/pixi/extendPixi.ts`**

```ts
import { extend } from '@pixi/react'
import { Container, Graphics, Sprite } from 'pixi.js'

let done = false
export function registerPixi() {
  if (done) return
  extend({ Container, Graphics, Sprite })
  done = true
}
```

- [ ] **Step 2: Implement `src/pixi/CellShadeFilter.ts`**

Use PixiJS v8 custom filter pattern (`GlProgram` + `resources` uniform group). Fragment shader must:

1. Sample `uTexture`
2. Quantize RGB by `uLevels` (e.g. `floor(color * levels + 0.5) / levels`)
3. Approximate Sobel via neighbor samples scaled by `1.0 / uInputSize.xy` (Pixi provides filter globals — if custom vertex does not expose them, pass `uTexel` as `vec2` updated from sprite texture size)
4. Mix outline with `uEdgeStrength`
5. Apply simple warm/cool: `color.rgb += vec3(uTint, uTint * 0.5, -uTint) * 0.15`

```ts
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
uniform sampler2D uTexture;
uniform float uLevels;
uniform float uEdgeStrength;
uniform float uTint;
uniform vec2 uTexel;
void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float levels = max(uLevels, 2.0);
  vec3 q = floor(color.rgb * levels + 0.5) / levels;

  float tl = dot(texture(uTexture, vTextureCoord + vec2(-uTexel.x, -uTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float t  = dot(texture(uTexture, vTextureCoord + vec2(0.0, -uTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float tr = dot(texture(uTexture, vTextureCoord + vec2(uTexel.x, -uTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float l  = dot(texture(uTexture, vTextureCoord + vec2(-uTexel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float r  = dot(texture(uTexture, vTextureCoord + vec2(uTexel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  float bl = dot(texture(uTexture, vTextureCoord + vec2(-uTexel.x, uTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float b  = dot(texture(uTexture, vTextureCoord + vec2(0.0, uTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float br = dot(texture(uTexture, vTextureCoord + vec2(uTexel.x, uTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  float edge = clamp(length(vec2(gx, gy)) * uEdgeStrength * 2.0, 0.0, 1.0);

  vec3 shaded = mix(q, vec3(0.0), edge);
  shaded += vec3(uTint, uTint * 0.5, -uTint) * 0.15;
  gl_FragColor = vec4(clamp(shaded, 0.0, 1.0), color.a);
}
`

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

  private get u() {
    return this.resources.cellShadeUniforms.uniforms as {
      uLevels: number
      uEdgeStrength: number
      uTint: number
      uTexel: Float32Array | number[]
    }
  }

  set levels(v: number) {
    this.u.uLevels = v
  }
  set edgeStrength(v: number) {
    this.u.uEdgeStrength = v
  }
  set tint(v: number) {
    this.u.uTint = v
  }
  setTexel(width: number, height: number) {
    this.u.uTexel = [1 / Math.max(width, 1), 1 / Math.max(height, 1)]
  }
}
```

If Pixi v8 requires `out vec4 finalColor` instead of `gl_FragColor`, switch fragment output to match the installed Pixi version’s filter examples.

- [ ] **Step 3: Commit**

```bash
git add src/pixi
git commit -m "$(cat <<'EOF'
Pixi 셀 쉐이딩 커스텀 필터 추가

색 양자화와 윤곽선·틴트 유니폼을 WebGL 필터로 제공한다.
EOF
)"
```

---

### Task 6: HandFrameStage + detection loop

**Files:**
- Create: `src/pixi/HandFrameStage.tsx`
- Modify: `src/App.tsx` (compose camera + tracker + stage)
- Create: `src/ui/StatusOverlay.tsx` (minimal: loading / hint)

**Interfaces:**
- Consumes: `useCamera`, `createHandTracker`, `createFrameGesture`, `CellShadeFilter`, `FilterSettings`, `GestureResult`
- Produces: `<HandFrameStage video={HTMLVideoElement} settings={FilterSettings} onGesture={...} paused={boolean} />` that owns rAF/ticker loop

- [ ] **Step 1: Implement stage**

`HandFrameStage.tsx` outline:

1. Call `registerPixi()` at module load.
2. Props: `videoRef`, `settings`, `paused`, `onPhaseChange?: (phase) => void`, `onTrackerError?: (msg: string) => void`.
3. On mount (when video live): `createHandTracker()` + `createFrameGesture()`.
4. `Texture.from(video)` (or `Texture.from({ resource: video })` per Pixi v8) for both sprites; update texture each tick with `texture.source.update()` if required.
5. Layers:
   - `pixiSprite` background (scale to cover Application size; apply `scale.x = mirror ? -1 : 1` with correct anchor/x)
   - `pixiSprite` effect twin with `filters={[cellShade]}` and `mask` = `Graphics` rect from `gesture.rect`
   - `pixiGraphics` border stroke around rect when `phase !== 'idle'`, alpha = `gesture.alpha`
6. Effect sprite / border `alpha = gesture.alpha`; hide mask when idle.
7. Each frame when `!paused && document.visibilityState === 'visible'`: `tracker.detect` → `gesture.update` → apply uniforms from `settings` → `filter.setTexel(video.videoWidth, video.videoHeight)`.
8. Cleanup: `tracker.close()`, cancel rAF / destroy texture on unmount.

Mirror note: MediaPipe sees the unmirrored video element. Keep `<video>` unmirrored for detection; apply mirror only in Pixi display transforms. Landmark x stays consistent with video pixels; when mirroring the sprite, also mirror the rect: `displayX = videoWidth - rect.x - rect.width` before drawing mask/border in stage space.

- [ ] **Step 2: StatusOverlay**

Show:

- idle camera: CTA button (handled in App)
- tracker loading: “모델 로딩 중…”
- live + gesture idle: `양손으로 프레임을 만들어 보세요`
- errors from camera/tracker

- [ ] **Step 3: Wire App**

Layout: full-bleed stage, overlay, no purple theme. Settings still hardcoded `DEFAULT_FILTER_SETTINGS` until Task 7.

- [ ] **Step 4: Manual check**

`pnpm dev` → L frame → interior cell shade + border; release → 250ms fade; one hand → idle hint.

- [ ] **Step 5: Commit**

```bash
git add src/pixi/HandFrameStage.tsx src/ui/StatusOverlay.tsx src/App.tsx src/styles.css
git commit -m "$(cat <<'EOF'
Pixi 스테이지에 손 프레임 셀 쉐이딩 합성

추적·제스처·마스크·테두리·페이드를 실시간으로 연결한다.
EOF
)"
```

---

### Task 7: Controls + polish

**Files:**
- Create: `src/ui/Controls.tsx`
- Modify: `src/App.tsx`, `src/styles.css`, `src/pixi/HandFrameStage.tsx` (visibility pause already required)

**Interfaces:**
- Consumes: `FilterSettings`, `DEFAULT_FILTER_SETTINGS`, `restart` from camera
- Produces: controlled settings panel updating stage uniforms live

- [ ] **Step 1: Implement `Controls.tsx`**

Sliders:

- 셀 강도 → `levels` range 2–8 step 1
- 윤곽선 → `edgeStrength` 0–1 step 0.01
- 틴트 → `tint` -0.5–0.5 step 0.01
- 미러 checkbox (default on)
- 카메라 재시작 button → `onRestartCamera`

- [ ] **Step 2: Pause when tab hidden**

In stage loop: if `document.visibilityState === 'hidden'`, skip `detect` (keep last frame). Optional: listen `visibilitychange` to set `paused`.

- [ ] **Step 3: Final manual checklist**

1. Camera deny → message + retry  
2. Model fail → message + retry (re-call `createHandTracker`)  
3. Two-hand L → shade + border  
4. Release → fade  
5. All sliders update look live  
6. Mirror toggle flips correctly without breaking gesture alignment  
7. `pnpm test` still passes; `pnpm run build` succeeds  

- [ ] **Step 4: Commit**

```bash
git add src/ui/Controls.tsx src/App.tsx src/styles.css src/pixi/HandFrameStage.tsx
git commit -m "$(cat <<'EOF'
필터 설정 UI와 탭 숨김 시 추적 일시정지 추가

강도·윤곽선·틴트·미러를 실시간으로 조절할 수 있게 한다.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Vite/React/TS/pnpm + Pixi + MediaPipe | 1, 4–6 |
| Two-hand L frame, AABB, 8% / aspect guards | 2 |
| lerp 0.35, fade 250ms | 2, 6 |
| Cell shade filter uniforms | 5, 7 |
| Border + masked effect layers | 6 |
| Mirror default on | 6, 7 |
| Camera / model errors + retry | 3, 6, 7 |
| Idle hint copy | 6 |
| Tab hidden pauses detection | 7 |
| Unit tests for FrameGesture | 2 |
| Non-goals (AI, record, mobile, presets) | not implemented |

**Placeholder scan:** none intentional.  
**Type consistency:** `HandSample` / `GestureResult` / `FilterSettings` shared across tasks as defined in Task 1–2.
