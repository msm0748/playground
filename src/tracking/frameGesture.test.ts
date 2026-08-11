import { describe, expect, it } from 'vitest'
import { createFrameGesture, type HandSample } from './frameGesture'

/** 21 points; only tips/joints we care about need real values */
function hand(
  handedness: 'Left' | 'Right',
  tips: { index: [number, number]; thumb: [number, number] },
): HandSample {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  landmarks[0] = { x: tips.thumb[0], y: tips.thumb[1] + 0.15 }
  landmarks[4] = { x: tips.thumb[0], y: tips.thumb[1] }
  landmarks[3] = { x: tips.thumb[0], y: tips.thumb[1] + 0.04 }
  landmarks[8] = { x: tips.index[0], y: tips.index[1] }
  landmarks[6] = { x: tips.index[0], y: tips.index[1] + 0.05 }
  landmarks[5] = { x: tips.index[0], y: tips.index[1] + 0.08 }
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
    expect(r.quad).toBeNull()
    expect(r.alpha).toBe(0)
  })

  it('activates on two-hand tips and returns a non-axis-aligned quad', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const left = hand('Left', { index: [0.28, 0.28], thumb: [0.32, 0.55] })
    const right = hand('Right', { index: [0.72, 0.32], thumb: [0.68, 0.58] })
    const r = g.update([left, right], { width: 1000, height: 1000 }, 0)
    expect(r.phase).toBe('active')
    expect(r.alpha).toBe(1)
    expect(r.quad).not.toBeNull()
    expect(r.quad!.points[0]).toEqual({ x: 280, y: 280 })
    expect(r.quad!.points[1]).toEqual({ x: 720, y: 320 })
    expect(r.quad!.points[2]).toEqual({ x: 680, y: 580 })
    expect(r.quad!.points[3]).toEqual({ x: 320, y: 550 })
  })

  it('pairs hands by position even when MediaPipe labels are both Left', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const a = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const b = hand('Left', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    const r = g.update([a, b], { width: 1000, height: 1000 }, 0)
    expect(r.phase).toBe('active')
    expect(r.quad!.points[0].x).toBeCloseTo(300, 0)
    expect(r.quad!.points[1].x).toBeCloseTo(700, 0)
  })

  it('keeps tracking when hands move closer together', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const openLeft = hand('Left', { index: [0.25, 0.3], thumb: [0.25, 0.55] })
    const openRight = hand('Right', { index: [0.75, 0.3], thumb: [0.75, 0.55] })
    expect(
      g.update([openLeft, openRight], { width: 1000, height: 1000 }, 0).phase,
    ).toBe('active')

    const closeLeft = hand('Left', { index: [0.42, 0.35], thumb: [0.42, 0.5] })
    const closeRight = hand('Right', {
      index: [0.58, 0.35],
      thumb: [0.58, 0.5],
    })
    const r = g.update([closeLeft, closeRight], { width: 1000, height: 1000 }, 16)
    expect(r.phase).toBe('active')
    expect(r.quad!.points[1].x - r.quad!.points[0].x).toBeCloseTo(160, 0)
  })

  it('rejects frames that are extremely small', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const left = hand('Left', { index: [0.495, 0.495], thumb: [0.495, 0.505] })
    const right = hand('Right', { index: [0.505, 0.495], thumb: [0.505, 0.505] })
    const r = g.update([left, right], { width: 1000, height: 1000 }, 0)
    expect(r.phase).toBe('idle')
  })

  it('smooths quad points with default lerpAlpha 0.35', () => {
    const g = createFrameGesture()
    const leftA = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const rightA = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    const size = { width: 1000, height: 1000 }
    g.update([leftA, rightA], size, 0)

    const leftB = hand('Left', { index: [0.32, 0.32], thumb: [0.32, 0.57] })
    const rightB = hand('Right', { index: [0.72, 0.32], thumb: [0.72, 0.57] })
    const r = g.update([leftB, rightB], size, 16)

    expect(r.phase).toBe('active')
    expect(r.quad!.points[0].x).toBeCloseTo(307, 0)
    expect(r.quad!.points[0].y).toBeCloseTo(307, 0)
    expect(r.quad!.points[0].x).not.toBeCloseTo(320, 0)
  })

  it('holds the last frame at full strength through a brief detection gap', () => {
    const g = createFrameGesture({ holdMs: 400, fadeMs: 250, lerpAlpha: 1 })
    const size = { width: 1000, height: 1000 }
    const left = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const right = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    const active = g.update([left, right], size, 0)

    const gap = g.update([], size, 200)
    expect(gap.phase).toBe('active')
    expect(gap.alpha).toBe(1)
    expect(gap.quad).toEqual(active.quad)

    // One hand cannot build a quad, but it must not drop the frame either.
    expect(g.update([left], size, 300).phase).toBe('active')

    const recovered = g.update([left, right], size, 380)
    expect(recovered.phase).toBe('active')
    expect(recovered.alpha).toBe(1)
  })

  it('fades only after the hold window expires', () => {
    const g = createFrameGesture({ holdMs: 400, fadeMs: 250, lerpAlpha: 1 })
    const size = { width: 1000, height: 1000 }
    const left = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const right = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    g.update([left, right], size, 0)

    expect(g.update([], size, 399).phase).toBe('active')
    const fading = g.update([], size, 500)
    expect(fading.phase).toBe('fading')
    expect(fading.alpha).toBeCloseTo(0.6, 5)
    expect(g.update([], size, 650).phase).toBe('idle')
  })

  it('defaults to holding the frame before it fades', () => {
    const g = createFrameGesture({ lerpAlpha: 1 })
    const size = { width: 1000, height: 1000 }
    const left = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const right = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    g.update([left, right], size, 0)

    expect(g.update([], size, 250).phase).toBe('active')
  })

  it('enters fading then idle after gesture lost', () => {
    const g = createFrameGesture({ holdMs: 0, fadeMs: 250, lerpAlpha: 1 })
    const left = hand('Left', { index: [0.3, 0.3], thumb: [0.3, 0.55] })
    const right = hand('Right', { index: [0.7, 0.3], thumb: [0.7, 0.55] })
    expect(g.update([left, right], { width: 1000, height: 1000 }, 0).phase).toBe(
      'active',
    )
    const mid = g.update([], { width: 1000, height: 1000 }, 100)
    expect(mid.phase).toBe('fading')
    expect(mid.quad).not.toBeNull()
    expect(mid.alpha).toBeGreaterThan(0)
    expect(mid.alpha).toBeLessThan(1)
    const done = g.update([], { width: 1000, height: 1000 }, 250)
    expect(done.phase).toBe('idle')
    expect(done.alpha).toBe(0)
    expect(done.quad).toBeNull()
  })
})
