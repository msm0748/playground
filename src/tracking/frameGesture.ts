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
  let lastActiveMs: number | null = null
  let lastRect: Rect | null = null

  function reset() {
    phase = 'idle'
    smoothed = null
    fadeStartMs = null
    lastActiveMs = null
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
      lastActiveMs = nowMs
      lastRect = { ...smoothed }
      return { phase, rect: lastRect, alpha: 1 }
    }

    if (phase === 'active' || phase === 'fading') {
      if (fadeStartMs === null) fadeStartMs = lastActiveMs ?? nowMs
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
