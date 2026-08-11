import { describe, expect, it } from 'vitest'
import {
  createFaceSampleHold,
  expressionFromBlendshapes,
  poseFromLandmarks,
  selectAnimeExpression,
  type FaceSample,
} from './faceTracker'

function blankMesh() {
  return Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
}

describe('poseFromLandmarks', () => {
  it('returns null for incomplete meshes', () => {
    expect(poseFromLandmarks([{ x: 0.1, y: 0.1 }], 1000, 1000)).toBeNull()
  })

  it('estimates face center size and rotation from key landmarks', () => {
    const mesh = blankMesh()
    mesh[33] = { x: 0.4, y: 0.42 }
    mesh[263] = { x: 0.6, y: 0.42 }
    mesh[1] = { x: 0.5, y: 0.5 }
    mesh[10] = { x: 0.5, y: 0.3 }
    mesh[152] = { x: 0.5, y: 0.7 }

    const pose = poseFromLandmarks(mesh, 1000, 1000)
    expect(pose).not.toBeNull()
    expect(pose!.width).toBeCloseTo(200 * 2.35, 0)
    expect(pose!.height).toBeGreaterThan(pose!.width)
    expect(pose!.rotation).toBeCloseTo(0, 2)
    expect(pose!.center.x).toBeGreaterThan(450)
    expect(pose!.center.x).toBeLessThan(550)
  })
})

describe('createFaceSampleHold', () => {
  const sample = (x: number): FaceSample => ({
    pose: { center: { x, y: 100 }, width: 200, height: 240, rotation: 0 },
    expression: { blinkLeft: 0, blinkRight: 0, jawOpen: 0 },
  })

  it('keeps the last face through a short detection gap', () => {
    const hold = createFaceSampleHold(300)
    const first = sample(500)

    expect(hold.update(first, 0)).toBe(first)
    expect(hold.update(null, 100)).toBe(first)
    expect(hold.update(null, 300)).toBe(first)
  })

  it('drops the face once the hold window expires', () => {
    const hold = createFaceSampleHold(300)

    hold.update(sample(500), 0)
    expect(hold.update(null, 301)).toBeNull()
    expect(hold.update(null, 302)).toBeNull()
  })

  it('measures the window from the newest detection, not the first', () => {
    const hold = createFaceSampleHold(300)
    const latest = sample(600)

    hold.update(sample(500), 0)
    expect(hold.update(latest, 250)).toBe(latest)
    expect(hold.update(null, 500)).toBe(latest)
    expect(hold.update(null, 600)).toBeNull()
  })

  it('forgets the held face after a reset', () => {
    const hold = createFaceSampleHold(300)

    hold.update(sample(500), 0)
    hold.reset()
    expect(hold.update(null, 10)).toBeNull()
  })
})

describe('expressionFromBlendshapes', () => {
  it('preserves left and right blink scores alongside jawOpen', () => {
    expect(
      expressionFromBlendshapes([
        { categoryName: 'eyeBlinkLeft', score: 0.2 },
        { categoryName: 'eyeBlinkRight', score: 0.8 },
        { categoryName: 'jawOpen', score: 0.55 },
      ]),
    ).toEqual({ blinkLeft: 0.2, blinkRight: 0.8, jawOpen: 0.55 })
  })
})

describe('selectAnimeExpression', () => {
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

  it('holds and releases left wink independently', () => {
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
  })
})
