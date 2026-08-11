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

  it('smooths rect with default lerpAlpha 0.35', () => {
    const g = createFrameGesture()
    const leftA = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const rightA = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    const size = { width: 1000, height: 1000 }
    g.update([leftA, rightA], size, 0)

    const leftB = hand('Left', { index: [0.32, 0.32], thumb: [0.32, 0.57] })
    const rightB = hand('Right', { index: [0.72, 0.32], thumb: [0.72, 0.57] })
    const r = g.update([leftB, rightB], size, 16)

    expect(r.phase).toBe('active')
    expect(r.rect!.x).toBeCloseTo(307, 0)
    expect(r.rect!.y).toBeCloseTo(307, 0)
    expect(r.rect!.x).not.toBeCloseTo(320, 0)
  })

  it('rejects frames with aspect ratio outside 1:3…3:1', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const size = { width: 1000, height: 1000 }
    const tooWideLeft = hand('Left', { index: [0.05, 0.35], thumb: [0.05, 0.45] })
    const tooWideRight = hand('Right', { index: [0.95, 0.35], thumb: [0.95, 0.45] })
    expect(g.update([tooWideLeft, tooWideRight], size, 0).phase).toBe('idle')

    const tooTallLeft = hand('Left', { index: [0.45, 0.05], thumb: [0.55, 0.05] })
    const tooTallRight = hand('Right', { index: [0.45, 0.95], thumb: [0.55, 0.95] })
    expect(g.update([tooTallLeft, tooTallRight], size, 0).phase).toBe('idle')
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
