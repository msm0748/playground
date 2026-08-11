import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FILTER_SETTINGS } from '../types'
import { Controls } from './Controls'

describe('Controls', () => {
  it('updates each filter setting and restarts the camera', () => {
    const onChange = vi.fn()
    const onRestartCamera = vi.fn()

    render(
      <Controls
        settings={DEFAULT_FILTER_SETTINGS}
        onChange={onChange}
        onRestartCamera={onRestartCamera}
      />,
    )

    const levels = screen.getByRole('slider', { name: '셀 강도' })
    expect(levels.getAttribute('min')).toBe('2')
    expect(levels.getAttribute('max')).toBe('8')
    expect(levels.getAttribute('step')).toBe('1')
    fireEvent.change(levels, { target: { value: '7' } })
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_SETTINGS,
      levels: 7,
    })

    fireEvent.change(screen.getByRole('slider', { name: '윤곽선' }), {
      target: { value: '0.4' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_SETTINGS,
      edgeStrength: 0.4,
    })

    fireEvent.change(screen.getByRole('slider', { name: '틴트' }), {
      target: { value: '-0.2' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_SETTINGS,
      tint: -0.2,
    })

    fireEvent.click(screen.getByRole('checkbox', { name: '미러' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_SETTINGS,
      mirror: false,
    })

    fireEvent.click(screen.getByRole('button', { name: '카메라 재시작' }))
    expect(onRestartCamera).toHaveBeenCalledOnce()
  })
})
