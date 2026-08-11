import { Application, useApplication } from '@pixi/react'
import {
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
import { createHandTracker, type HandTracker } from '../tracking/handTracker'
import { createFrameGesture } from '../tracking/frameGesture'
import type {
  FilterSettings,
  GesturePhase,
  GestureResult,
  Rect,
} from '../types'
import { CellShadeFilter } from './CellShadeFilter'
import { registerPixi } from './extendPixi'

registerPixi()

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
}

const IDLE_GESTURE: GestureResult = {
  phase: 'idle',
  rect: null,
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

export function mapRectToStage(
  rect: Rect,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): Rect {
  const sourceX = mirror
    ? videoWidth - rect.x - rect.width
    : rect.x

  return {
    x: layout.offsetX + sourceX * layout.scale,
    y: layout.offsetY + rect.y * layout.scale,
    width: rect.width * layout.scale,
    height: rect.height * layout.scale,
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
  const [mask, setMask] = useState<Graphics | null>(null)
  const [resources, setResources] = useState<StageResources | null>(null)
  const settingsRef = useRef(settings)
  const pausedRef = useRef(paused)
  const phaseCallbackRef = useRef(onPhaseChange)
  const errorCallbackRef = useRef(onTrackerError)
  const filters = useMemo(
    () => (resources ? [resources.filter] : []),
    [resources],
  )

  settingsRef.current = settings
  pausedRef.current = paused
  phaseCallbackRef.current = onPhaseChange
  errorCallbackRef.current = onTrackerError

  useEffect(() => {
    const created: StageResources = {
      texture: createVideoTexture(video),
      filter: new CellShadeFilter(),
    }
    setResources(created)

    return () => {
      // Deliberately no state reset here: on unmount the Pixi application is already
      // being destroyed, and re-rendering against it would read a torn-down renderer.
      created.filter.destroy()
      releaseVideoTexture(created.texture)
    }
  }, [video])

  useEffect(() => {
    if (!resources) return

    const { texture, filter } = resources
    let cancelled = false
    let animationFrameId: number | null = null
    let tracker: HandTracker | null = null
    let lastPhase: GesturePhase = 'idle'
    const frameGesture = createFrameGesture()
    const failureGuard = createDetectFailureGuard()

    const runFrame = (nowMs: number) => {
      if (cancelled || !tracker) return

      if (
        !pausedRef.current &&
        document.visibilityState === 'visible' &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        try {
          texture.source.update()
          const hands = tracker.detect(video, nowMs)
          const nextGesture = frameGesture.update(
            hands,
            { width: video.videoWidth, height: video.videoHeight },
            nowMs,
          )
          const currentSettings = settingsRef.current
          filter.levels = currentSettings.levels
          filter.edgeStrength = currentSettings.edgeStrength
          filter.tint = currentSettings.tint
          setGesture(nextGesture)
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
            tracker.close()
            tracker = null
            return
          }
        }
      }

      animationFrameId = requestAnimationFrame(runFrame)
    }

    void createHandTracker()
      .then((createdTracker) => {
        if (cancelled) {
          createdTracker.close()
          return
        }

        tracker = createdTracker
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
      tracker?.close()
      frameGesture.reset()
    }
  }, [resources, trackerKey, video])

  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  // A StrictMode remount destroys and recreates the Pixi application, so this render can
  // still receive the torn-down instance whose `screen` getter would throw.
  const screen = app.renderer ? app.screen : null
  const stageWidth = screen?.width ?? 0
  const stageHeight = screen?.height ?? 0
  const layout = getCoverLayout(
    videoWidth,
    videoHeight,
    stageWidth,
    stageHeight,
  )
  const displayRect =
    gesture.rect && videoWidth > 0
      ? mapRectToStage(gesture.rect, videoWidth, layout, settings.mirror)
      : null
  const spriteScale = {
    x: layout.scale * (settings.mirror ? -1 : 1),
    y: layout.scale,
  }

  const drawMask = useCallback(
    (graphics: Graphics) => {
      graphics.clear()
      if (!displayRect) return
      graphics
        .rect(
          displayRect.x,
          displayRect.y,
          displayRect.width,
          displayRect.height,
        )
        .fill({ color: 0xffffff })
    },
    [displayRect],
  )

  const drawBorder = useCallback(
    (graphics: Graphics) => {
      graphics.clear()
      if (!displayRect) return
      graphics
        .rect(
          displayRect.x,
          displayRect.y,
          displayRect.width,
          displayRect.height,
        )
        .stroke({ color: 0xffffff, width: 3 })
    },
    [displayRect],
  )

  if (!screen || !resources) return null

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
        alpha={gesture.alpha}
        visible={gesture.phase !== 'idle'}
      />
      <pixiGraphics
        draw={drawBorder}
        alpha={gesture.alpha}
        visible={gesture.phase !== 'idle'}
      />
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
