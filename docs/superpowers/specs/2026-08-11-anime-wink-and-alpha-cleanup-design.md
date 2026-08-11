# Anime Wink Matching and Alpha Cleanup Design

## Goal

Make the anime face overlay follow the user's actual left- and right-eye closures while preserving the current blink and mouth behavior. Clean the transparent character assets so old background pixels do not remain between hair strands or around the silhouette.

## Scope

- Track left and right eye closure independently from MediaPipe face blendshapes.
- Add anatomical left-wink and right-wink expressions, including mouth-open variants.
- Keep simultaneous eye closure mapped to the existing full-blink expressions.
- Preserve the current face pose, placement, scale, rotation, hand-frame masking, and camera mirror setting.
- Clean all expression PNGs with one consistent alpha silhouette so animation frames do not jump.

## Expression Model

`FaceExpression` will expose `blinkLeft`, `blinkRight`, and `jawOpen` as normalized values. Expression selection will use hysteresis independently for both eyes and the mouth.

The renderer will support eight expression keys:

| Eyes | Mouth closed | Mouth open |
| --- | --- | --- |
| Both open | `neutral` | `mouth` |
| Left closed | `winkLeft` | `winkLeftMouth` |
| Right closed | `winkRight` | `winkRightMouth` |
| Both closed | `blink` | `blinkMouth` |

When both eyes cross the closed threshold, full blink wins over either wink. Independent hysteresis prevents rapid switching near thresholds.

## Left/Right and Mirroring

Left and right are anatomical labels from MediaPipe (`eyeBlinkLeft` and `eyeBlinkRight`), not raw screen coordinates. Wink asset names use the character's anatomical sides. The existing renderer mirrors the whole anime sprite together with the camera when `settings.mirror` is enabled, so no separate left/right swap is performed in expression selection.

This gives intuitive behavior in both modes:

- Mirrored preview: the user's wink appears on the same visible side as a mirror.
- Unmirrored preview: the wink follows camera/photograph orientation.

## Asset Construction

The existing 1024×1024 registered frames remain the source of truth. New wink frames will be constructed with localized eye-region edits from the existing neutral, blink, mouth, and blink-mouth artwork rather than regenerating the complete character. This preserves hairstyle, face shape, palette, canvas size, and registration across animation states.

The final asset set is:

- `anime-face-overlay.png`
- `anime-face-eyes-closed.png`
- `anime-face-mouth-open.png`
- `anime-face-blink-mouth.png`
- `anime-face-wink-left.png`
- `anime-face-wink-right.png`
- `anime-face-wink-left-mouth.png`
- `anime-face-wink-right-mouth.png`

All eight images will share a cleaned transparent silhouette. Background-colored pixels inside enclosed hair gaps, the pale blobs below the lower curls, and gray/white edge halos will become transparent while intentional hair highlights and skin details remain opaque. Edge antialiasing will be preserved without changing canvas dimensions or character placement.

## Integration

`ANIME_FACE_ASSETS` will map all eight expression keys to their PNGs. Existing asset loading and texture selection remain unchanged apart from the expanded key set. Cache-busting query versions will be advanced for modified files.

## Tests

Unit tests will verify:

- Blendshape extraction keeps left and right blink scores separate.
- A left-only closure selects `winkLeft` and a right-only closure selects `winkRight`.
- Both eyes closed select `blink`.
- Mouth-open combinations select the corresponding mouth variants.
- Hysteresis holds each eye state independently and releases it below the off threshold.
- Mirror mode does not swap anatomical expression keys; sprite mirroring remains the rendering responsibility.
- All eight assets exist, are 1024×1024 PNGs, and retain alpha transparency.

## Acceptance Criteria

- Winking either real eye closes only the matching character eye.
- Closing both eyes still triggers a normal blink.
- Opening the mouth does not cancel a wink.
- Toggling mirror mode produces visually correct left/right behavior without changing tracking labels.
- Expression changes do not move or resize the character.
- No old background is visible between hair strands, below hair tips, or around the silhouette on light or dark backgrounds.
