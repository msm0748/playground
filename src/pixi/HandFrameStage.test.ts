import { createElement } from 'react'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycleMocks = vi.hoisted(() => ({
  createHandTracker: vi.fn(),
  createFaceTracker: vi.fn(),
  loadAsset: vi.fn(),
  unloadAsset: vi.fn(),
}))

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>()
  return {
    ...actual,
    Assets: {
      load: lifecycleMocks.loadAsset,
      unload: lifecycleMocks.unloadAsset,
    },
  }
})

vi.mock('../tracking/handTracker', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../tracking/handTracker')>()
  return { ...actual, createHandTracker: lifecycleMocks.createHandTracker }
})

vi.mock('../tracking/faceTracker', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../tracking/faceTracker')>()
  return { ...actual, createFaceTracker: lifecycleMocks.createFaceTracker }
})

vi.mock('@pixi/react', () => ({
  Application: () => null,
  extend: vi.fn(),
  useApplication: () => ({
    app: { screen: { width: 0, height: 0 } },
  }),
}))

beforeEach(() => {
  lifecycleMocks.createHandTracker.mockReset()
  lifecycleMocks.createFaceTracker.mockReset()
  lifecycleMocks.loadAsset.mockReset()
  lifecycleMocks.unloadAsset.mockReset()
  lifecycleMocks.createHandTracker.mockResolvedValue({
    detect: vi.fn(() => []),
    close: vi.fn(),
  })
  lifecycleMocks.createFaceTracker.mockResolvedValue({
    detect: vi.fn(() => null),
    close: vi.fn(),
  })
  lifecycleMocks.loadAsset.mockResolvedValue({ width: 512, height: 512 })
  lifecycleMocks.unloadAsset.mockResolvedValue(undefined)
  // jsdom has no 2D canvas, and the ASCII glyph atlas draws its ramp on one.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
  } as never)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HandFrameStage layout', () => {
  it('describes the resources owned by each filter mode', async () => {
    const { capabilitiesForMode } = await import('./HandFrameStage')

    expect(capabilitiesForMode('png')).toEqual({
      animeAssets: true,
      faceTracking: true,
      promptFilter: false,
      asciiFilter: false,
    })
    expect(capabilitiesForMode('prompt')).toEqual({
      animeAssets: false,
      faceTracking: false,
      promptFilter: true,
      asciiFilter: false,
    })
    expect(capabilitiesForMode('ascii')).toEqual({
      animeAssets: false,
      faceTracking: false,
      promptFilter: false,
      asciiFilter: true,
    })
  })

  it('caps high-density rendering at 1.5x', async () => {
    const { capRenderingResolution } = await import('./HandFrameStage')

    expect(capRenderingResolution(1)).toBe(1)
    expect(capRenderingResolution(2)).toBe(1.5)
  })

  it('does not load anime assets for prompt mode', async () => {
    const { createModeResources } = await import('./HandFrameStage')
    const texturePool = { acquire: vi.fn() }

    const resources = await createModeResources('prompt', texturePool)

    expect(resources.mode).toBe('prompt')
    expect(texturePool.acquire).not.toHaveBeenCalled()
    resources.filter.destroy()
  })

  it('does not create a face tracker for prompt mode', async () => {
    const { createFaceTrackerForMode } = await import('./HandFrameStage')
    const faceFactory = vi.fn()

    expect(await createFaceTrackerForMode('prompt', faceFactory)).toBeNull()
    expect(await createFaceTrackerForMode('ascii', faceFactory)).toBeNull()
    expect(faceFactory).not.toHaveBeenCalled()
  })

  it('does not load anime assets for ascii mode', async () => {
    const { createModeResources } = await import('./HandFrameStage')
    const texturePool = { acquire: vi.fn() }

    const resources = await createModeResources('ascii', texturePool)

    expect(resources.mode).toBe('ascii')
    expect(texturePool.acquire).not.toHaveBeenCalled()
    resources.filter.destroy()
  })

  it('registers a distinct texture URL for every anime expression', async () => {
    const { ANIME_FACE_ASSETS } = await import('./HandFrameStage')

    expect(ANIME_FACE_ASSETS).toEqual({
      neutral: '/anime-face-overlay.webp?v=1',
      blink: '/anime-face-eyes-closed.webp?v=1',
      mouth: '/anime-face-mouth-open.webp?v=1',
      blinkMouth: '/anime-face-blink-mouth.webp?v=1',
      winkLeft: '/anime-face-wink-left.webp?v=1',
      winkRight: '/anime-face-wink-right.webp?v=1',
      winkLeftMouth: '/anime-face-wink-left-mouth.webp?v=1',
      winkRightMouth: '/anime-face-wink-right-mouth.webp?v=1',
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

describe('PNG mode face shading region', () => {
  const frameQuad = {
    points: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
  } as never
  const identityLayout = { scale: 1, offsetX: 0, offsetY: 0 }

  it('keeps the shaded region inside the tracked face box', async () => {
    const { faceMaskPolygon, FACE_MASK_PADDING } =
      await import('./HandFrameStage')

    const polygon = faceMaskPolygon(
      { center: { x: 500, y: 500 }, width: 200, height: 260, rotation: 0 },
      frameQuad,
      1280,
      identityLayout,
      false,
    )

    const xs = polygon.map((point) => point.x)
    const ys = polygon.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(500 - 100 * FACE_MASK_PADDING, 5)
    expect(Math.max(...xs)).toBeCloseTo(500 + 100 * FACE_MASK_PADDING, 5)
    expect(Math.min(...ys)).toBeCloseTo(500 - 130 * FACE_MASK_PADDING, 5)
    expect(Math.max(...ys)).toBeCloseTo(500 + 130 * FACE_MASK_PADDING, 5)
  })

  it('never shades outside the hand frame', async () => {
    const { faceMaskPolygon } = await import('./HandFrameStage')

    const polygon = faceMaskPolygon(
      { center: { x: 60, y: 500 }, width: 400, height: 400, rotation: 0 },
      frameQuad,
      1280,
      identityLayout,
      false,
    )

    expect(polygon.length).toBeGreaterThan(2)
    expect(polygon.every((point) => point.x >= -1e-6)).toBe(true)
    expect(Math.min(...polygon.map((point) => point.x))).toBeCloseTo(0, 5)
  })

  it('drops the shading when the face sits outside the hand frame', async () => {
    const { faceMaskPolygon } = await import('./HandFrameStage')

    const polygon = faceMaskPolygon(
      { center: { x: 5000, y: 500 }, width: 200, height: 200, rotation: 0 },
      frameQuad,
      1280,
      identityLayout,
      false,
    )

    expect(polygon).toEqual([])
  })

  it('clips a polygon against either quad winding', async () => {
    const { clipPolygonToQuad } = await import('./HandFrameStage')
    const wide = [
      { x: -10, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: 8 },
      { x: -10, y: 8 },
    ]
    const clockwise = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 10 },
      { x: 0, y: 10 },
    ]

    for (const points of [clockwise, [...clockwise].reverse()]) {
      const clipped = clipPolygonToQuad(wide, { points } as never)
      expect(Math.min(...clipped.map((point) => point.x))).toBeCloseTo(0, 5)
      expect(Math.max(...clipped.map((point) => point.x))).toBeCloseTo(6, 5)
      expect(Math.min(...clipped.map((point) => point.y))).toBeCloseTo(2, 5)
      expect(Math.max(...clipped.map((point) => point.y))).toBeCloseTo(8, 5)
    }
  })
})

describe('anime texture lifecycle', () => {
  it('unloads an asset only after its final overlapping generation releases it', async () => {
    const { createAnimeTexturePool } = await import('./HandFrameStage')
    const texture = { width: 512, height: 512 }
    const load = vi.fn(async () => texture as never)
    const unload = vi.fn(async () => undefined)
    const pool = createAnimeTexturePool(load, unload)

    const first = await pool.acquire('/face.png')
    const second = await pool.acquire('/face.png')

    await first.release()
    expect(unload).not.toHaveBeenCalled()

    await second.release()
    expect(load).toHaveBeenCalledTimes(1)
    expect(unload).toHaveBeenCalledExactlyOnceWith('/face.png')
  })

  it('waits for a final unload before a later generation reloads the same asset', async () => {
    const { createAnimeTexturePool } = await import('./HandFrameStage')
    let finishUnload: (() => void) | undefined
    const unloadGate = new Promise<void>((resolve) => {
      finishUnload = resolve
    })
    const load = vi.fn(async () => ({ width: 512, height: 512 }) as never)
    const unload = vi.fn(() => unloadGate)
    const pool = createAnimeTexturePool(load, unload)
    const first = await pool.acquire('/face.png')

    const releasing = first.release()
    const nextLeasePromise = pool.acquire('/face.png')
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)

    finishUnload?.()
    await releasing
    const nextLease = await nextLeasePromise
    expect(load).toHaveBeenCalledTimes(2)
    await nextLease.release()
  })

  it('reloads a fresh generation when the prior final unload rejects', async () => {
    const { createAnimeTexturePool } = await import('./HandFrameStage')
    let failUnload: ((error: Error) => void) | undefined
    const unloadGate = new Promise<void>((_resolve, reject) => {
      failUnload = reject
    })
    const load = vi.fn(async () => ({ width: 512, height: 512 }) as never)
    const unload = vi
      .fn()
      .mockImplementationOnce(() => unloadGate)
      .mockResolvedValue(undefined)
    const pool = createAnimeTexturePool(load, unload)
    const first = await pool.acquire('/face.png')

    const releasing = first.release()
    const nextLeasePromise = pool.acquire('/face.png')
    failUnload?.(new Error('GPU release failed'))

    await expect(releasing).rejects.toThrow('GPU release failed')
    const nextLease = await nextLeasePromise
    expect(load).toHaveBeenCalledTimes(2)
    await nextLease.release()
  })

  it('releases every successful lease after a partial PNG load failure and preserves that failure', async () => {
    const { createModeResources } = await import('./HandFrameStage')
    const loadFailure = new Error('wink texture failed')
    const cleanupFailure = new Error('cleanup failed')
    const reportCleanup = vi.spyOn(console, 'error').mockImplementation(() => {})
    const releases: Array<ReturnType<typeof vi.fn>> = []
    let acquisition = 0
    const texturePool = {
      acquire: vi.fn(async () => {
        acquisition += 1
        if (acquisition === 3) throw loadFailure
        const currentAcquisition = acquisition
        const release = vi.fn(async () => {
          if (currentAcquisition === 1) throw cleanupFailure
        })
        releases.push(release)
        return {
          texture: { width: 512, height: 512 } as never,
          release,
        }
      }),
    }

    await expect(createModeResources('png', texturePool)).rejects.toBe(
      loadFailure,
    )
    expect(releases).toHaveLength(7)
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(
      true,
    )
    expect(reportCleanup).toHaveBeenCalledWith(
      '필터 리소스를 해제하지 못했습니다',
      cleanupFailure,
    )
  })

  it('keeps the mounted hand tracker across a mode switch and releases PNG assets', async () => {
    const { ANIME_FACE_ASSETS, StageContent } =
      await import('./HandFrameStage')
    const video = document.createElement('video')
    const common = {
      video,
      settings: {
        levels: 5,
        edgeStrength: 0.65,
        tint: 0.1,
        mirror: true,
      },
      paused: false,
    }
    const view = render(
      createElement(StageContent, { ...common, mode: 'png' }),
    )

    await waitFor(() => {
      expect(lifecycleMocks.createHandTracker).toHaveBeenCalledTimes(1)
      expect(lifecycleMocks.loadAsset).toHaveBeenCalledTimes(
        Object.keys(ANIME_FACE_ASSETS).length,
      )
    })

    view.rerender(
      createElement(StageContent, { ...common, mode: 'png', resourceKey: 1 }),
    )
    await waitFor(() => {
      expect(lifecycleMocks.loadAsset).toHaveBeenCalledTimes(
        Object.keys(ANIME_FACE_ASSETS).length * 2,
      )
    })
    expect(lifecycleMocks.createHandTracker).toHaveBeenCalledTimes(1)

    view.rerender(createElement(StageContent, { ...common, mode: 'prompt' }))

    await waitFor(() => {
      expect(lifecycleMocks.unloadAsset).toHaveBeenCalledTimes(
        Object.keys(ANIME_FACE_ASSETS).length * 2,
      )
    })
    expect(lifecycleMocks.createHandTracker).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('releases PNG assets whose async creation finishes after cancellation', async () => {
    const { ANIME_FACE_ASSETS, StageContent } =
      await import('./HandFrameStage')
    let finishLoad: ((texture: { width: number; height: number }) => void) | undefined
    const pendingTexture = new Promise<{ width: number; height: number }>(
      (resolve) => {
        finishLoad = resolve
      },
    )
    lifecycleMocks.loadAsset.mockReturnValue(pendingTexture)
    const video = document.createElement('video')
    const common = {
      video,
      settings: {
        levels: 5,
        edgeStrength: 0.65,
        tint: 0.1,
        mirror: true,
      },
      paused: false,
    }
    const view = render(
      createElement(StageContent, { ...common, mode: 'png' }),
    )
    await waitFor(() => {
      expect(lifecycleMocks.loadAsset).toHaveBeenCalledTimes(
        Object.keys(ANIME_FACE_ASSETS).length,
      )
    })

    view.rerender(createElement(StageContent, { ...common, mode: 'prompt' }))
    finishLoad?.({ width: 512, height: 512 })

    await waitFor(() => {
      expect(lifecycleMocks.unloadAsset).toHaveBeenCalledTimes(
        Object.keys(ANIME_FACE_ASSETS).length,
      )
    })
    expect(lifecycleMocks.createHandTracker).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('reports cleanup rejection without surfacing a stale mode error', async () => {
    const { ANIME_FACE_ASSETS, StageContent } =
      await import('./HandFrameStage')
    const cleanupFailure = new Error('GPU release failed')
    lifecycleMocks.unloadAsset.mockRejectedValue(cleanupFailure)
    const reportModeError = vi.fn()
    const reportCleanup = vi.spyOn(console, 'error').mockImplementation(() => {})
    const video = document.createElement('video')
    const common = {
      video,
      settings: {
        levels: 5,
        edgeStrength: 0.65,
        tint: 0.1,
        mirror: true,
      },
      paused: false,
      onModeResourceError: reportModeError,
    }
    const view = render(
      createElement(StageContent, { ...common, mode: 'png' }),
    )
    await waitFor(() => {
      expect(lifecycleMocks.loadAsset).toHaveBeenCalledTimes(
        Object.keys(ANIME_FACE_ASSETS).length,
      )
    })

    view.rerender(createElement(StageContent, { ...common, mode: 'prompt' }))

    await waitFor(() => {
      expect(reportCleanup).toHaveBeenCalledWith(
        '필터 리소스를 해제하지 못했습니다',
        cleanupFailure,
      )
    })
    expect(reportModeError).not.toHaveBeenCalled()
    view.unmount()
  })

  it('recreates the PNG face tracker after a shared hand-tracker retry', async () => {
    const { StageContent } = await import('./HandFrameStage')
    const video = document.createElement('video')
    const common = {
      video,
      mode: 'png' as const,
      settings: {
        levels: 5,
        edgeStrength: 0.65,
        tint: 0.1,
        mirror: true,
      },
      paused: false,
    }
    const view = render(createElement(StageContent, common))
    await waitFor(() => {
      expect(lifecycleMocks.createHandTracker).toHaveBeenCalledTimes(1)
      expect(lifecycleMocks.createFaceTracker).toHaveBeenCalledTimes(1)
    })

    view.rerender(createElement(StageContent, { ...common, trackerKey: 1 }))

    await waitFor(() => {
      expect(lifecycleMocks.createHandTracker).toHaveBeenCalledTimes(2)
      expect(lifecycleMocks.createFaceTracker).toHaveBeenCalledTimes(2)
    })
    view.unmount()
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
