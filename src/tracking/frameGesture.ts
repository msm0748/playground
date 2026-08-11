import type { GestureResult, Point, Quad } from '../types'
import { INDEX_TIP, THUMB_TIP } from './landmarks'

export type LandmarkPoint = { x: number; y: number; z?: number }
export type HandSample = {
  handedness: 'Left' | 'Right'
  landmarks: LandmarkPoint[]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

function cloneQuad(quad: Quad): Quad {
  return {
    points: [
      { ...quad.points[0] },
      { ...quad.points[1] },
      { ...quad.points[2] },
      { ...quad.points[3] },
    ],
  }
}

/** Frame corners come from thumb + index tips only — no curl/extension gating. */
function hasThumbAndIndexTips(hand: HandSample): boolean {
  const lm = hand.landmarks
  if (lm.length < 21) return false
  const thumb = lm[THUMB_TIP]
  const index = lm[INDEX_TIP]
  return (
    Number.isFinite(thumb.x) &&
    Number.isFinite(thumb.y) &&
    Number.isFinite(index.x) &&
    Number.isFinite(index.y)
  )
}

function tipPoint(
  hand: HandSample,
  tip: number,
  width: number,
  height: number,
): Point {
  const p = hand.landmarks[tip]
  return { x: p.x * width, y: p.y * height }
}

/** Order: left-index → right-index → right-thumb → left-thumb (non-axis-aligned). */
function tipsQuad(
  left: HandSample,
  right: HandSample,
  width: number,
  height: number,
): Quad {
  return {
    points: [
      tipPoint(left, INDEX_TIP, width, height),
      tipPoint(right, INDEX_TIP, width, height),
      tipPoint(right, THUMB_TIP, width, height),
      tipPoint(left, THUMB_TIP, width, height),
    ],
  }
}

function quadBounds(quad: Quad): { width: number; height: number; area: number } {
  const xs = quad.points.map((p) => p.x)
  const ys = quad.points.map((p) => p.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  // Shoelace area (absolute)
  let area = 0
  for (let i = 0; i < 4; i++) {
    const a = quad.points[i]
    const b = quad.points[(i + 1) % 4]
    area += a.x * b.y - b.x * a.y
  }
  return { width, height, area: Math.abs(area) / 2 }
}

function isValidQuad(quad: Quad, videoW: number, videoH: number): boolean {
  const { width, height, area } = quadBounds(quad)
  const minSide = Math.min(videoW, videoH) * 0.03
  if (width < minSide || height < minSide) return false
  const minArea = minSide * minSide
  if (area < minArea) return false
  const aspect = width / Math.max(height, 1e-6)
  return aspect >= 1 / 4 && aspect <= 4
}

export function createFrameGesture(options?: {
  fadeMs?: number
  lerpAlpha?: number
}) {
  const fadeMs = options?.fadeMs ?? 250
  const lerpAlpha = options?.lerpAlpha ?? 0.35

  let phase: GestureResult['phase'] = 'idle'
  let smoothed: Quad | null = null
  let fadeStartMs: number | null = null
  let lastActiveMs: number | null = null
  let lastQuad: Quad | null = null

  function reset() {
    phase = 'idle'
    smoothed = null
    fadeStartMs = null
    lastActiveMs = null
    lastQuad = null
  }

  function update(
    hands: HandSample[],
    videoSize: { width: number; height: number },
    nowMs: number,
  ): GestureResult {
    const left = hands.find((h) => h.handedness === 'Left')
    const right = hands.find((h) => h.handedness === 'Right')
    const raw =
      left && right && hasThumbAndIndexTips(left) && hasThumbAndIndexTips(right)
        ? tipsQuad(left, right, videoSize.width, videoSize.height)
        : null
    const framing = !!raw && isValidQuad(raw, videoSize.width, videoSize.height)

    if (framing && raw) {
      if (!smoothed) smoothed = cloneQuad(raw)
      else {
        smoothed = {
          points: [
            lerpPoint(smoothed.points[0], raw.points[0], lerpAlpha),
            lerpPoint(smoothed.points[1], raw.points[1], lerpAlpha),
            lerpPoint(smoothed.points[2], raw.points[2], lerpAlpha),
            lerpPoint(smoothed.points[3], raw.points[3], lerpAlpha),
          ],
        }
      }
      phase = 'active'
      fadeStartMs = null
      lastActiveMs = nowMs
      lastQuad = cloneQuad(smoothed)
      return { phase, quad: lastQuad, alpha: 1 }
    }

    if (phase === 'active' || phase === 'fading') {
      if (fadeStartMs === null) fadeStartMs = lastActiveMs ?? nowMs
      const t = Math.min(1, (nowMs - fadeStartMs) / fadeMs)
      const alpha = 1 - t
      if (t >= 1) {
        reset()
        return { phase: 'idle', quad: null, alpha: 0 }
      }
      phase = 'fading'
      return { phase, quad: lastQuad, alpha }
    }

    return { phase: 'idle', quad: null, alpha: 0 }
  }

  return { update, reset }
}
