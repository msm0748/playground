# Hand Frame Cell Shade — Design Spec

**Date:** 2026-08-11  
**Status:** Approved for planning  
**Stack:** Vite + React + TypeScript + pnpm, PixiJS v8 (`@pixi/react`), MediaPipe Tasks Vision (`HandLandmarker`)

## Goal

Webcam demo where a two-hand L-shaped “viewfinder” gesture defines a rectangle. Outside the rectangle shows the live camera feed; inside applies a real-time **cell-shading** look (color quantization + outlines) via a PixiJS WebGL filter. Polish includes frame border highlight, fade-out when hands release, and simple intensity/color controls.

## Non-goals (v1)

- AI / GAN anime face conversion
- Face-landmark-based eye/hair replacement
- Recording, sharing, or mobile-first optimization
- Multiple style presets (cell shade only)
- Backend, accounts, or persistence

## Architecture

```text
getUserMedia → <video> (hidden)
       ↓
MediaPipe HandLandmarker (per frame)
       ↓
FrameGesture → smoothed rect | idle | fading
       ↓
Pixi Stage
  ├─ BackgroundSprite (raw webcam texture)
  ├─ EffectSprite (same texture + CellShadeFilter + rect mask)
  └─ FrameBorder (Graphics)
       ↑
Controls (levels, edge, tint, mirror)
```

### Modules

| Module | Responsibility | Depends on |
|--------|----------------|------------|
| `Camera` | Request permission, own `MediaStream`, expose `<video>` + mirror flag | Browser APIs |
| `HandTracker` | Load HandLandmarker, run detection, map landmarks to pixel space | Camera video, MediaPipe |
| `FrameGesture` | Detect two-hand L frame, compute AABB, smooth, manage idle/active/fading | Hand landmarks |
| `CellShadeFilter` | Pixi `Filter` — posterize + edge composite via GLSL uniforms | PixiJS |
| `Stage` | Compose sprites, mask, border; drive ticker from video/tracker | All of the above |
| `Controls` | UI for filter uniforms + mirror + camera retry | Stage / Camera state |

## Gesture & coordinates

### Activation

- Both hands must be detected.
- Each hand approximates an L: thumb and index extended; other fingers preferentially curled.
- Expected tips (selfie / mirrored view):
  - Left hand: index ≈ top-left corner, thumb ≈ bottom-left
  - Right hand: index ≈ top-right, thumb ≈ bottom-right
- Rectangle = axis-aligned bounds of the four tips (index + thumb on both hands).
- Reject (treat as inactive) if either side is under **8% of the shorter video dimension**, or aspect ratio is outside **1:3 … 3:1**.

### Smoothing & states

- Exponential moving average on rect edges: `smoothed = lerp(smoothed, raw, 0.35)` per detection frame.
- States: `idle` → `active` → `fading` (**250ms** linear alpha fade) → `idle`.
- Losing the gesture starts `fading`; completing fade clears mask/border.

### Coordinate system

- MediaPipe normalized landmarks → video pixel space → Pixi stage space.
- Horizontal mirror on by default (selfie); toggle in Controls.

## Rendering & filter

### Pixi scene layers

1. Full-frame webcam sprite (unfiltered).
2. Duplicate webcam sprite with `CellShadeFilter` and a rectangular mask matching the gesture rect.
3. `Graphics` border / corner highlight when `active` or `fading`.

During `fading`, only alpha of effect + border decreases; rect stays at last known position.

### `CellShadeFilter` uniforms

| Uniform | Purpose | Control |
|---------|---------|---------|
| `levels` | Color quantization steps | Cell intensity slider |
| `edgeStrength` | Outline contribution | Outline slider |
| `tint` | Warm/cool bias | Tint slider |

Implementation: fragment shader approximating cell look (quantize RGB, Sobel or similar edge, composite). No ML models for stylization.

## UI / UX

- Pre-permission: clear “allow camera” CTA.
- While tracking but idle: short hint — “양손으로 프레임을 만들어 보세요”.
- Controls panel: cell intensity, outline strength, tint, mirror on/off, camera restart.
- Target: desktop Chrome/Edge first.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Camera denied / missing | Message + retry action |
| Model load failure | Loading state + retry |
| Zero or one hand | Stay idle + hint (not an error) |
| Tab hidden | Pause detection loop |

## Testing

- Unit: `FrameGesture` L detection, AABB, min-size rejection, smoothing, state transitions (synthetic landmarks).
- Manual: camera permission, frame on/off, fade, all sliders, mirror toggle on Chrome desktop.

## Success criteria

On desktop Chrome: form two-hand L frame → interior cell-shaded with visible border; release hands → fade out; adjust levels / outline / tint / mirror and see updates in real time.

## Open decisions resolved

- Stylization: canvas/WebGL cell shade (not AI anime) → PixiJS custom filter.
- Gesture: two-hand L rectangle (reference image).
- Scope: polished demo (border, fade, settings), not share/mobile.
- Look: classic cell shading (not line-art-only or pastel).
- Approach: MediaPipe + WebGL via React + PixiJS (not Canvas2D-only or CSS filters).
