import type { ChangeEvent } from 'react'
import type { FilterSettings } from '../types'

type ControlsProps = {
  settings: FilterSettings
  onChange: (settings: FilterSettings) => void
  onRestartCamera: () => void
}

type SliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: SliderProps) {
  return (
    <label className="controls__field">
      <span>{label}</span>
      <output>{value}</output>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function Controls({
  settings,
  onChange,
  onRestartCamera,
}: ControlsProps) {
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
    <aside className="controls" aria-label="필터 설정">
      <Slider
        label="셀 강도"
        value={settings.levels}
        min={2}
        max={8}
        step={1}
        onChange={(value) => update('levels', value)}
      />
      <Slider
        label="윤곽선"
        value={settings.edgeStrength}
        min={0}
        max={1}
        step={0.01}
        onChange={(value) => update('edgeStrength', value)}
      />
      <Slider
        label="틴트"
        value={settings.tint}
        min={-0.5}
        max={0.5}
        step={0.01}
        onChange={(value) => update('tint', value)}
      />
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
    </aside>
  )
}
