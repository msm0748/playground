import { Application, useApplication } from '@pixi/react'
import {
  Assets,
  Graphics,
  Texture,
  VideoSource,
} from 'pixi.js'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createFaceTracker, selectAnimeExpression, type AnimeExpressionKey, type FacePose, type FaceSample, type FaceTracker } from '../tracking/faceTracker'
import { createFrameGesture } from '../tracking/frameGesture'
import { createHandTracker, type HandTracker } from '../tracking/handTracker'
import type {
  FilterSettings,
  GesturePhase,
  GestureResult,
  Point,
  Quad,
} from '../types'
import { CellShadeFilter } from './CellShadeFilter'
import { registerPixi } from './extendPixi'

registerPixi()

const ANIME_FACE_ASSETS: Record<AnimeExpressionKey, string> = {
  neutral: '/anime-face-overlay.png?v=3',
  blink: '/anime-face-eyes-closed.png?v=1',
  mouth: '/anime-face-mouth-open.png?v=1',
  blinkMouth: '/anime-face-blink-mouth.png?v=1',
}

type CoverLayout = {
  scale: number
  offsetX: number
  offsetY: number
}

type HandFrameStageProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  settings: FilterSettings
  paused: boolean
  /** Bumping this recreates the hand tracker without restarting the camera. */
  trackerKey?: number
  onPhaseChange?: (phase: GesturePhase) => void
  onTrackerError?: (message: string) => void
}

type StageContentProps = Omit<HandFrameStageProps, 'videoRef'> & {
  video: HTMLVideoElement
}

type StageResources = {
  texture: Texture
  filter: CellShadeFilter
  animeTextures: Record<AnimeExpressionKey, Texture>
}

type AnimeTransform = {
  x: number
  y: number
  scale: number
  rotation: number
}

const IDLE_GESTURE: GestureResult = {
  phase: 'idle',
  quad: null,
  alpha: 0,
}

/** Detection hiccups are common while the GPU delegate warms up, so tolerate a few. */
export const MAX_CONSECUTIVE_DETECT_FAILURES = 5

export function createDetectFailureGuard(
  limit: number = MAX_CONSECUTIVE_DETECT_FAILURES,
) {
  let consecutive = 0

  return {
    /** Returns true once the failures should be surfaced and tracking stopped. */
    recordFailure(): boolean {
      consecutive += 1
      return consecutive >= limit
    },
    recordSuccess(): void {
      consecutive = 0
    },
  }
}

/**
 * The `<video>` element is owned by `useCamera`, so the texture only borrows it:
 * frames are uploaded manually from the tracking loop and the source is never destroyed.
 */
function createVideoTexture(video: HTMLVideoElement): Texture {
  const source = new VideoSource({ resource: video, autoPlay: false })
  source.autoUpdate = false
  return new Texture({ source })
}

function releaseVideoTexture(texture: Texture): void {
  const source = texture.source
  if (source instanceof VideoSource) {
    source.autoUpdate = false
  }
  texture.destroy(false)
}

export function getCoverLayout(
  videoWidth: number,
  videoHeight: number,
  stageWidth: number,
  stageHeight: number,
): CoverLayout {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    stageWidth <= 0 ||
    stageHeight <= 0
  ) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }

  const scale = Math.max(stageWidth / videoWidth, stageHeight / videoHeight)
  return {
    scale,
    offsetX: (stageWidth - videoWidth * scale) / 2,
    offsetY: (stageHeight - videoHeight * scale) / 2,
  }
}

function mapPointToStage(
  point: Point,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): Point {
  const sourceX = mirror ? videoWidth - point.x : point.x
  return {
    x: layout.offsetX + sourceX * layout.scale,
    y: layout.offsetY + point.y * layout.scale,
  }
}

export function mapQuadToStage(
  quad: Quad,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): Quad {
  return {
    points: [
      mapPointToStage(quad.points[0], videoWidth, layout, mirror),
      mapPointToStage(quad.points[1], videoWidth, layout, mirror),
      mapPointToStage(quad.points[2], videoWidth, layout, mirror),
      mapPointToStage(quad.points[3], videoWidth, layout, mirror),
    ],
  }
}

export function animeTransformFromFace(
  face: FacePose,
  animeTexture: Texture,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): AnimeTransform {
  const center = mapPointToStage(face.center, videoWidth, layout, mirror)
  const targetWidth = face.width * layout.scale * 1.35
  const scale = targetWidth / Math.max(animeTexture.width, 1)
  return {
    x: center.x,
    y: center.y,
    scale,
    rotation: mirror ? -face.rotation : face.rotation,
  }
}

export function animeTransformFromQuad(
  quad: Quad,
  animeTexture: Texture,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): AnimeTransform {
  const display = mapQuadToStage(quad, videoWidth, layout, mirror)
  const xs = display.points.map((p) => p.x)
  const ys = display.points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const scale = Math.min(
    (width * 1.05) / Math.max(animeTexture.width, 1),
    (height * 1.2) / Math.max(animeTexture.height, 1),
  )
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    scale,
    rotation: 0,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '손 추적 모델을 불러올 수 없습니다'
}

function StageContent({
  video,
  settings,
  paused,
  trackerKey = 0,
  onPhaseChange,
  onTrackerError,
}: StageContentProps) {
  const { app } = useApplication()
  const [gesture, setGesture] = useState<GestureResult>(IDLE_GESTURE)
  const [faceSample, setFaceSample] = useState<FaceSample | null>(null)
  const [expressionKey, setExpressionKey] =
    useState<AnimeExpressionKey>('neutral')
  const [mask, setMask] = useState<Graphics | null>(null)
  const [resources, setResources] = useState<StageResources | null>(null)
  const settingsRef = useRef(settings)
  const pausedRef = useRef(paused)
  const phaseCallbackRef = useRef(onPhaseChange)
  const errorCallbackRef = useRef(onTrackerError)
  const expressionKeyRef = useRef<AnimeExpressionKey>('neutral')
  const filters = useMemo(
    () => (resources ? [resources.filter] : []),
    [resources],
  )

  settingsRef.current = settings
  pausedRef.current = paused
  phaseCallbackRef.current = onPhaseChange
  errorCallbackRef.current = onTrackerError

  useEffect(() => {
    let cancelled = false
    let created: StageResources | null = null

    void Promise.all(
      (Object.keys(ANIME_FACE_ASSETS) as AnimeExpressionKey[]).map(async (key) => {
        const src = ANIME_FACE_ASSETS[key]
        const texture = (await Assets.load({
          alias: src,
          src,
          data: { alphaMode: 'premultiply-alpha-on-upload' },
        })) as Texture
        return [key, texture] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return
        created = {
          texture: createVideoTexture(video),
          filter: new CellShadeFilter(),
          animeTextures: Object.fromEntries(entries) as Record<
            AnimeExpressionKey,
            Texture
          >,
        }
        setResources(created)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          errorCallbackRef.current?.(errorMessage(error))
        }
      })

    return () => {
      cancelled = true
      if (created) {
        created.filter.destroy()
        releaseVideoTexture(created.texture)
      }
    }
  }, [video])

  useEffect(() => {
    if (!resources) return

    const { texture, filter } = resources
    let cancelled = false
    let animationFrameId: number | null = null
    let handTracker: HandTracker | null = null
    let faceTracker: FaceTracker | null = null
    let lastPhase: GesturePhase = 'idle'
    const frameGesture = createFrameGesture()
    const failureGuard = createDetectFailureGuard()

    const runFrame = (nowMs: number) => {
      if (cancelled || !handTracker) return

      if (
        !pausedRef.current &&
        document.visibilityState === 'visible' &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        try {
          texture.source.update()
          const hands = handTracker.detect(video, nowMs)
          const nextGesture = frameGesture.update(
            hands,
            { width: video.videoWidth, height: video.videoHeight },
            nowMs,
          )
          const nextFace =
            nextGesture.phase === 'idle'
              ? null
              : (faceTracker?.detect(video, nowMs) ?? null)
          const nextExpression = nextFace
            ? selectAnimeExpression(
                nextFace.expression,
                expressionKeyRef.current,
              )
            : 'neutral'
          expressionKeyRef.current = nextExpression

          const currentSettings = settingsRef.current
          filter.levels = currentSettings.levels
          filter.edgeStrength = currentSettings.edgeStrength
          filter.tint = currentSettings.tint

          setGesture(nextGesture)
          setFaceSample(nextFace)
          setExpressionKey(nextExpression)
          failureGuard.recordSuccess()

          if (nextGesture.phase !== lastPhase) {
            lastPhase = nextGesture.phase
            phaseCallbackRef.current?.(nextGesture.phase)
          }
        } catch (error) {
          if (failureGuard.recordFailure()) {
            errorCallbackRef.current?.(errorMessage(error))
            frameGesture.reset()
            setGesture(IDLE_GESTURE)
            setFaceSample(null)
            setExpressionKey('neutral')
            expressionKeyRef.current = 'neutral'
            handTracker.close()
            handTracker = null
            faceTracker?.close()
            faceTracker = null
            return
          }
        }
      }

      animationFrameId = requestAnimationFrame(runFrame)
    }

    void Promise.all([createHandTracker(), createFaceTracker()])
      .then(([createdHandTracker, createdFaceTracker]) => {
        if (cancelled) {
          createdHandTracker.close()
          createdFaceTracker.close()
          return
        }

        handTracker = createdHandTracker
        faceTracker = createdFaceTracker
        phaseCallbackRef.current?.('idle')
        animationFrameId = requestAnimationFrame(runFrame)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          errorCallbackRef.current?.(errorMessage(error))
        }
      })

    return () => {
      cancelled = true
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      handTracker?.close()
      faceTracker?.close()
      frameGesture.reset()
    }
  }, [resources, trackerKey, video])

  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  const screen = app.renderer ? app.screen : null
  const stageWidth = screen?.width ?? 0
  const stageHeight = screen?.height ?? 0
  const layout = getCoverLayout(
    videoWidth,
    videoHeight,
    stageWidth,
    stageHeight,
  )
  const displayQuad =
    gesture.quad && videoWidth > 0
      ? mapQuadToStage(gesture.quad, videoWidth, layout, settings.mirror)
      : null
  const spriteScale = {
    x: layout.scale * (settings.mirror ? -1 : 1),
    y: layout.scale,
  }
  const animeTexture =
    resources?.animeTextures[expressionKey] ??
    resources?.animeTextures.neutral ??
    null
  const facePose = faceSample?.pose ?? null
  const animeTransform =
    resources && animeTexture && gesture.quad && videoWidth > 0
      ? facePose
        ? animeTransformFromFace(
            facePose,
            animeTexture,
            videoWidth,
            layout,
            settings.mirror,
          )
        : animeTransformFromQuad(
            gesture.quad,
            animeTexture,
            videoWidth,
            layout,
            settings.mirror,
          )
      : null

  const drawMask = useCallback(
    (graphics: Graphics) => {
      graphics.clear()
      if (!displayQuad) return
      const [a, b, c, d] = displayQuad.points
      graphics
        .poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y])
        .fill({ color: 0xffffff })
    },
    [displayQuad],
  )

  if (!screen || !resources || !animeTexture) return null

  return (
    <>
      <pixiSprite
        texture={resources.texture}
        anchor={0.5}
        x={stageWidth / 2}
        y={stageHeight / 2}
        scale={spriteScale}
      />
      <pixiGraphics
        ref={setMask}
        draw={drawMask}
        visible={gesture.phase !== 'idle'}
      />
      <pixiSprite
        texture={resources.texture}
        anchor={0.5}
        x={stageWidth / 2}
        y={stageHeight / 2}
        scale={spriteScale}
        filters={filters}
        mask={mask}
        alpha={gesture.alpha * 0.35}
        visible={gesture.phase !== 'idle'}
      />
      {animeTransform && (
        <pixiSprite
          texture={animeTexture}
          anchor={0.5}
          x={animeTransform.x}
          y={animeTransform.y}
          scale={{
            x: animeTransform.scale * (settings.mirror ? -1 : 1),
            y: animeTransform.scale,
          }}
          rotation={animeTransform.rotation}
          mask={mask}
          alpha={gesture.alpha}
          visible={gesture.phase !== 'idle'}
        />
      )}
    </>
  )
}

export function HandFrameStage({
  videoRef,
  settings,
  paused,
  trackerKey,
  onPhaseChange,
  onTrackerError,
}: HandFrameStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const video = videoRef.current

  return (
    <div className="hand-frame-stage" ref={containerRef}>
      <Application
        resizeTo={containerRef}
        backgroundColor={0x111111}
        antialias
        autoDensity
        resolution={window.devicePixelRatio}
      >
        {video && (
          <StageContent
            video={video}
            settings={settings}
            paused={paused}
            trackerKey={trackerKey}
            onPhaseChange={onPhaseChange}
            onTrackerError={onTrackerError}
          />
        )}
      </Application>
    </div>
  )
}
