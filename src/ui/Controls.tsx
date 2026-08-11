import { useState, type ChangeEvent } from 'react'
import type { FilterMode, FilterSettings } from '../types'

export type ControlsProps = {
  mode: FilterMode
  settings: FilterSettings
  onModeChange: (mode: FilterMode) => void
  onChange: (settings: FilterSettings) => void
  onRestartCamera: () => void
  /** Panels start open; collapsed is remembered only for the session. */
  defaultOpen?: boolean
}

const PANEL_ID = 'controls-panel'

export function Controls({
  mode,
  settings,
  onModeChange,
  onChange,
  onRestartCamera,
  defaultOpen = true,
}: ControlsProps) {
  const [open, setOpen] = useState(defaultOpen)

  const update = <Key extends keyof FilterSettings>(
    key: Key,
    value: FilterSettings[Key],
  ) => {
    onChange({ ...settings, [key]: value })
  }

  const handleMirrorChange = (event: ChangeEvent<HTMLInputElement>) => {
    update('mirror', event.target.checked)
  }

  return (
    <aside
      className={open ? 'controls' : 'controls controls--collapsed'}
      aria-label="필터 설정"
    >
      <div className="controls__header">
        {open && <strong className="controls__title">필터</strong>}
        <button
          type="button"
          className="controls__collapse"
          aria-label={open ? '필터 설정 닫기' : '필터 설정 열기'}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? '닫기' : '필터'}
        </button>
      </div>
      <div id={PANEL_ID} className="controls__panel" hidden={!open}>
        <div className="controls__modes" role="group" aria-label="필터 선택">
          <button
            type="button"
            aria-label="PNG 모드"
            aria-pressed={mode === 'png'}
            onClick={() => onModeChange('png')}
          >
            <strong>PNG 모드</strong>
            <span>표정이 움직이는 애니메 얼굴</span>
          </button>
          <button
            type="button"
            aria-label="프롬프트 모드"
            aria-pressed={mode === 'prompt'}
            onClick={() => onModeChange('prompt')}
          >
            <strong>프롬프트 모드</strong>
            <span>실시간 셀 애니 카메라</span>
          </button>
        </div>
        <label className="controls__toggle">
          <input
            type="checkbox"
            checked={settings.mirror}
            onChange={handleMirrorChange}
          />
          <span>미러</span>
        </label>
        <button type="button" onClick={onRestartCamera}>
          카메라 재시작
        </button>
      </div>
    </aside>
  )
}
