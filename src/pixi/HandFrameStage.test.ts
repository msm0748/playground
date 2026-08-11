import { describe, expect, it, vi } from 'vitest'

vi.mock('@pixi/react', () => ({
  Application: () => null,
  extend: vi.fn(),
  useApplication: () => ({
    app: { screen: { width: 0, height: 0 } },
  }),
}))

describe('HandFrameStage layout', () => {
  it('covers the stage while preserving the video aspect ratio', async () => {
    const { getCoverLayout } = await import('./HandFrameStage')

    expect(getCoverLayout(1280, 720, 1000, 1000)).toEqual({
      scale: 1000 / 720,
      offsetX: (1000 - 1280 * (1000 / 720)) / 2,
      offsetY: 0,
    })
  })

  it('mirrors a source rect before mapping it into stage space', async () => {
    const { mapRectToStage } = await import('./HandFrameStage')

    expect(
      mapRectToStage(
        { x: 100, y: 50, width: 300, height: 200 },
        1280,
        { scale: 2, offsetX: -100, offsetY: 25 },
        true,
      ),
    ).toEqual({
      x: 1660,
      y: 125,
      width: 600,
      height: 400,
    })
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
