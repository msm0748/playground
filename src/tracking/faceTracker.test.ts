import { describe, expect, it } from 'vitest'
import {
  BLINK_ON,
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
  it.each([
    [{ blinkLeft: 0.1, blinkRight: 0.1, jawOpen: 0.1 }, 'neutral'],
    [{ blinkLeft: 0.9, blinkRight: 0.1, jawOpen: 0.1 }, 'winkLeft'],
    [{ blinkLeft: 0.1, blinkRight: 0.9, jawOpen: 0.1 }, 'winkRight'],
    [{ blinkLeft: 0.9, blinkRight: 0.9, jawOpen: 0.1 }, 'blink'],
    [{ blinkLeft: 0.1, blinkRight: 0.1, jawOpen: 0.6 }, 'mouth'],
    [{ blinkLeft: 0.9, blinkRight: 0.1, jawOpen: 0.6 }, 'winkLeftMouth'],
    [{ blinkLeft: 0.1, blinkRight: 0.9, jawOpen: 0.6 }, 'winkRightMouth'],
    [{ blinkLeft: 0.9, blinkRight: 0.9, jawOpen: 0.6 }, 'blinkMouth'],
  ] as const)('selects %s as %s', (expression, expected) => {
    expect(selectAnimeExpression(expression)).toBe(expected)
  })

  it.each([0.2, 0.35, 0.45, 0.5])(
    'keeps the eyes open for a partial blink of %s',
    (score) => {
      expect(
        selectAnimeExpression({
          blinkLeft: score,
          blinkRight: score,
          jawOpen: 0.1,
        }),
      ).toBe('neutral')
    },
  )

  it('closes the eyes once the blink clears the squint range', () => {
    expect(BLINK_ON).toBeGreaterThan(0.5)
    expect(
      selectAnimeExpression({
        blinkLeft: BLINK_ON,
        blinkRight: BLINK_ON,
        jawOpen: 0.1,
      }),
    ).toBe('blink')
  })

  it('reopens the eyes once the blink relaxes past the release point', () => {
    expect(
      selectAnimeExpression(
        { blinkLeft: 0.3, blinkRight: 0.3, jawOpen: 0.1 },
        'blink',
      ),
    ).toBe('neutral')
  })

  it('keeps the eyes closed while the blink relaxes inside the hysteresis gap', () => {
    expect(
      selectAnimeExpression(
        { blinkLeft: 0.45, blinkRight: 0.45, jawOpen: 0.1 },
        'blink',
      ),
    ).toBe('blink')
  })

  it('holds and releases left wink independently', () => {
    expect(
      selectAnimeExpression(
        { blinkLeft: 0.6, blinkRight: 0.1, jawOpen: 0.1 },
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
