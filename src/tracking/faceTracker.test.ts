import { describe, expect, it } from 'vitest'
import {
  expressionFromBlendshapes,
  poseFromLandmarks,
  selectAnimeExpression,
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
  it('picks blink and mouth variants with hysteresis', () => {
    expect(
      selectAnimeExpression({ blinkLeft: 0.6, blinkRight: 0, jawOpen: 0.1 }),
    ).toBe('blink')
    expect(
      selectAnimeExpression(
        { blinkLeft: 0.4, blinkRight: 0, jawOpen: 0.1 },
        'blink',
      ),
    ).toBe(
      'blink',
    )
    expect(
      selectAnimeExpression(
        { blinkLeft: 0.1, blinkRight: 0, jawOpen: 0.1 },
        'blink',
      ),
    ).toBe(
      'neutral',
    )
    expect(
      selectAnimeExpression({ blinkLeft: 0.1, blinkRight: 0, jawOpen: 0.5 }),
    ).toBe('mouth')
    expect(
      selectAnimeExpression({ blinkLeft: 0.7, blinkRight: 0, jawOpen: 0.6 }),
    ).toBe(
      'blinkMouth',
    )
  })
})
