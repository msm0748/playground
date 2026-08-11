import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCamera } from './useCamera'

describe('useCamera', () => {
  it('stops acquired tracks when video startup fails', async () => {
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    })

    const { result } = renderHook(() => useCamera())
    const video = document.createElement('video')
    video.play = vi.fn().mockRejectedValue(new Error('재생 실패'))
    result.current.videoRef.current = video

    await act(async () => {
      await result.current.start()
    })

    expect(stop).toHaveBeenCalledOnce()
    expect(result.current.state.status).toBe('error')
  })
})
