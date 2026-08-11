import {
  FaceLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision'
import type { Point } from '../types'

const WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

/** MediaPipe Face Mesh indices used for pose. */
const NOSE_TIP = 1
const CHIN = 152
const FOREHEAD = 10
const LEFT_EYE_OUTER = 33
const RIGHT_EYE_OUTER = 263

export type FacePose = {
  /** Face center in video pixel space. */
  center: Point
  /** Approximate face width / height in video pixels. */
  width: number
  height: number
  /** Radians; positive tilts the face clockwise in video space. */
  rotation: number
}

export type FaceTracker = {
  detect: (video: HTMLVideoElement, timestampMs: number) => FacePose | null
  close: () => void
}

function landmarkPoint(
  landmarks: Array<{ x: number; y: number }>,
  index: number,
  width: number,
  height: number,
): Point {
  const p = landmarks[index]
  return { x: p.x * width, y: p.y * height }
}

export function poseFromLandmarks(
  landmarks: Array<{ x: number; y: number }>,
  videoWidth: number,
  videoHeight: number,
): FacePose | null {
  if (landmarks.length < 300) return null

  const leftEye = landmarkPoint(landmarks, LEFT_EYE_OUTER, videoWidth, videoHeight)
  const rightEye = landmarkPoint(landmarks, RIGHT_EYE_OUTER, videoWidth, videoHeight)
  const nose = landmarkPoint(landmarks, NOSE_TIP, videoWidth, videoHeight)
  const chin = landmarkPoint(landmarks, CHIN, videoWidth, videoHeight)
  const forehead = landmarkPoint(landmarks, FOREHEAD, videoWidth, videoHeight)

  const eyeSpan = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)
  if (eyeSpan < 1) return null

  const eyeMidX = (leftEye.x + rightEye.x) * 0.5
  const eyeMidY = (leftEye.y + rightEye.y) * 0.5
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y)
  const width = eyeSpan * 2.35
  const height = Math.max(faceHeight * 1.15, width * 1.15)
  const rotation = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)

  return {
    center: {
      x: eyeMidX * 0.35 + nose.x * 0.65,
      y: eyeMidY * 0.25 + (forehead.y + chin.y) * 0.375,
    },
    width,
    height,
    rotation,
  }
}

export async function createFaceTracker(): Promise<FaceTracker> {
  const vision = await FilesetResolver.forVisionTasks(WASM)
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  })

  return {
    detect(video, timestampMs) {
      if (video.readyState < 2) return null
      const result = landmarker.detectForVideo(video, timestampMs)
      const landmarks = result.faceLandmarks[0]
      if (!landmarks) return null
      return poseFromLandmarks(
        landmarks,
        video.videoWidth,
        video.videoHeight,
      )
    },
    close() {
      landmarker.close()
    },
  }
}
