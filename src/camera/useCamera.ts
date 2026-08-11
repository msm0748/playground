import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = {
  status: 'idle' | 'requesting' | 'live' | 'error'
  errorMessage: string | null
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CameraState>({
    status: 'idle',
    errorMessage: null,
  })

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState({ status: 'idle', errorMessage: null })
  }, [])

  const start = useCallback(async () => {
    setState({ status: 'requesting', errorMessage: null })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('Video element missing')
      video.srcObject = stream
      await video.play()
      setState({ status: 'live', errorMessage: null })
    } catch (e) {
      const message =
        e instanceof Error ? e.message : '카메라를 사용할 수 없습니다'
      setState({ status: 'error', errorMessage: message })
    }
  }, [])

  const restart = useCallback(async () => {
    stop()
    await start()
  }, [start, stop])

  useEffect(() => () => stop(), [stop])

  return { videoRef, state, start, stop, restart }
}
