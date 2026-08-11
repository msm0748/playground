import { beforeEach, describe, expect, it, vi } from 'vitest'

const { close, createFromOptions, detectForVideo, forVisionTasks } = vi.hoisted(
  () => ({
    close: vi.fn(),
    createFromOptions: vi.fn(),
    detectForVideo: vi.fn(),
    forVisionTasks: vi.fn(),
  }),
)

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks },
  HandLandmarker: { createFromOptions },
}))

import { createHandTracker } from './handTracker'

describe('createHandTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    forVisionTasks.mockResolvedValue('vision')
    createFromOptions.mockResolvedValue({ close, detectForVideo })
  })

  it('configures MediaPipe for two-hand video detection', async () => {
    await createHandTracker()

    expect(forVisionTasks).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    )
    expect(createFromOptions).toHaveBeenCalledWith('vision', {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    })
  })

  it('returns no samples until the video has current data', async () => {
    const tracker = await createHandTracker()
    const video = document.createElement('video')

    expect(tracker.detect(video, 10)).toEqual([])
    expect(detectForVideo).not.toHaveBeenCalled()
  })

  it('maps recognized handedness and landmarks into hand samples', async () => {
    detectForVideo.mockReturnValue({
      landmarks: [
        [{ x: 0.1, y: 0.2, z: 0.3 }],
        [{ x: 0.4, y: 0.5, z: 0.6 }],
        [{ x: 0.7, y: 0.8, z: 0.9 }],
      ],
      handedness: [
        [{ categoryName: 'Left' }],
        [{ categoryName: 'Unknown' }],
        [{ categoryName: 'Right' }],
      ],
    })
    const tracker = await createHandTracker()
    const video = document.createElement('video')
    Object.defineProperty(video, 'readyState', { value: 2 })

    expect(tracker.detect(video, 42)).toEqual([
      {
        handedness: 'Left',
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      },
      {
        handedness: 'Right',
        landmarks: [{ x: 0.7, y: 0.8, z: 0.9 }],
      },
    ])
    expect(detectForVideo).toHaveBeenCalledWith(video, 42)
  })

  it('closes the MediaPipe landmarker', async () => {
    const tracker = await createHandTracker()

    tracker.close()

    expect(close).toHaveBeenCalledOnce()
  })
})
