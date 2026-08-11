import { describe, expect, it, vi } from 'vitest'

vi.mock('@pixi/react', () => ({
  Application: () => null,
  extend: vi.fn(),
  useApplication: () => ({
    app: { screen: { width: 0, height: 0 } },
  }),
}))

describe('HandFrameStage layout', () => {
  it('registers a distinct texture URL for every anime expression', async () => {
    const { ANIME_FACE_ASSETS } = await import('./HandFrameStage')

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
  })

  it('covers the stage while preserving the video aspect ratio', async () => {
    const { getCoverLayout } = await import('./HandFrameStage')

    expect(getCoverLayout(1280, 720, 1000, 1000)).toEqual({
      scale: 1000 / 720,
      offsetX: (1000 - 1280 * (1000 / 720)) / 2,
      offsetY: 0,
    })
  })

  it('mirrors quad corners before mapping them into stage space', async () => {
    const { mapQuadToStage } = await import('./HandFrameStage')

    expect(
      mapQuadToStage(
        {
          points: [
            { x: 100, y: 50 },
            { x: 400, y: 50 },
            { x: 400, y: 250 },
            { x: 100, y: 250 },
          ],
        },
        1280,
        { scale: 2, offsetX: -100, offsetY: 25 },
        true,
      ),
    ).toEqual({
      points: [
        { x: 2260, y: 125 },
        { x: 1660, y: 125 },
        { x: 1660, y: 525 },
        { x: 2260, y: 525 },
      ],
    })
  })

  it('scales the anime overlay to the tracked face width', async () => {
    const { animeTransformFromFace } = await import('./HandFrameStage')
    const texture = { width: 512, height: 512 } as never

    const transform = animeTransformFromFace(
      {
        center: { x: 640, y: 360 },
        width: 200,
        height: 240,
        rotation: 0.1,
      },
      texture,
      1280,
      { scale: 1, offsetX: 0, offsetY: 0 },
      false,
    )

    expect(transform.x).toBe(640)
    expect(transform.y).toBe(360)
    expect(transform.scale).toBeCloseTo((200 * 1.35) / 512, 5)
    expect(transform.rotation).toBeCloseTo(0.1, 5)
  })
})

describe('detect failure guard', () => {
  it('tolerates transient failures until the limit is reached', async () => {
    const { createDetectFailureGuard } = await import('./HandFrameStage')
    const guard = createDetectFailureGuard(3)

    expect(guard.recordFailure()).toBe(false)
    expect(guard.recordFailure()).toBe(false)
    expect(guard.recordFailure()).toBe(true)
  })

  it('forgets earlier failures once a frame succeeds', async () => {
    const { createDetectFailureGuard } = await import('./HandFrameStage')
    const guard = createDetectFailureGuard(2)

    expect(guard.recordFailure()).toBe(false)
    guard.recordSuccess()
    expect(guard.recordFailure()).toBe(false)
    expect(guard.recordFailure()).toBe(true)
  })

  it('defaults to tolerating several consecutive failures', async () => {
    const { MAX_CONSECUTIVE_DETECT_FAILURES, createDetectFailureGuard } =
      await import('./HandFrameStage')
    const guard = createDetectFailureGuard()

    expect(MAX_CONSECUTIVE_DETECT_FAILURES).toBeGreaterThan(1)
    for (let i = 1; i < MAX_CONSECUTIVE_DETECT_FAILURES; i++) {
      expect(guard.recordFailure()).toBe(false)
    }
    expect(guard.recordFailure()).toBe(true)
  })
})
