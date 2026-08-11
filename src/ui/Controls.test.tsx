import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FILTER_SETTINGS } from '../types'
import { Controls } from './Controls'

describe('Controls', () => {
  it('selects a filter mode and updates mirror settings', () => {
    const onModeChange = vi.fn()
    const onChange = vi.fn()
    const onRestartCamera = vi.fn()

    render(
      <Controls
        mode="png"
        settings={DEFAULT_FILTER_SETTINGS}
        onModeChange={onModeChange}
        onChange={onChange}
        onRestartCamera={onRestartCamera}
      />,
    )

    expect(screen.getByRole('group', { name: '필터 선택' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '프롬프트 모드' }))
    expect(onModeChange).toHaveBeenCalledWith('prompt')
    expect(screen.queryByRole('slider')).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: '미러' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_SETTINGS,
      mirror: false,
    })

    fireEvent.click(screen.getByRole('button', { name: '아스키 모드' }))
    expect(onModeChange).toHaveBeenCalledWith('ascii')

    fireEvent.click(screen.getByRole('button', { name: '카메라 재시작' }))
    expect(onRestartCamera).toHaveBeenCalledTimes(1)
  })

  it('collapses to a single button and reopens with the same settings', () => {
    render(
      <Controls
        mode="png"
        settings={DEFAULT_FILTER_SETTINGS}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
        onRestartCamera={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '필터 설정 닫기' }))
    expect(screen.queryByRole('group', { name: '필터 선택' })).toBeNull()
    expect(screen.queryByRole('button', { name: '카메라 재시작' })).toBeNull()

    const reopen = screen.getByRole('button', { name: '필터 설정 열기' })
    expect(reopen.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(reopen)
    expect(screen.getByRole('group', { name: '필터 선택' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '미러' })).toBeTruthy()
  })

  it('can start collapsed', () => {
    render(
      <Controls
        mode="png"
        settings={DEFAULT_FILTER_SETTINGS}
        onModeChange={vi.fn()}
        onChange={vi.fn()}
        onRestartCamera={vi.fn()}
        defaultOpen={false}
      />,
    )

    expect(screen.getByRole('button', { name: '필터 설정 열기' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: '필터 선택' })).toBeNull()
  })
})
