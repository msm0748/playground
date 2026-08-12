# Witch VTuber Asset Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 에셋을 보존하면서 독창적인 치비 마녀풍 캐릭터의 레이어 파츠와 표정 WebP 세트를 `public/vtuber-witch/`에 추가한다.

**Architecture:** 모든 파츠는 1024×1024 동일 캔버스와 공통 기준점을 사용한다. 캐릭터의 뒤쪽 머리·몸·얼굴·눈·눈썹·입·앞머리·모자·장식을 독립된 투명 레이어로 만들고, 표정은 눈·입·눈썹 변형 파츠로 교체한다. 기존 `public/anime-face-*`와 기존 Pixi 연결부는 이번 작업에서 수정하지 않는다.

**Tech Stack:** built-in image generation, local image alpha cleanup, Node.js `sharp`, WebP RGBA, existing Pixi/Vite asset conventions.

## Global Constraints

- 새 파일은 `public/vtuber-witch/` 아래에만 저장한다.
- 기존 `public/anime-face-*` 파일과 기존 앱 코드는 변경하지 않는다.
- 참고 이미지는 할로윈 마녀풍 분위기만 참고하고, 특정 원본의 캐릭터·구도·장식 조합·워터마크를 복제하지 않는다.
- 모든 산출물은 1024×1024 RGBA WebP이며 동일한 anchor 기준을 사용한다.
- 최종 파일에는 워터마크, 텍스트, 배경, 그림자, 불투명 모서리를 포함하지 않는다.

---

### Task 1: Asset directory and naming manifest

**Files:**
- Create: `public/vtuber-witch/README.md`
- Create: `public/vtuber-witch/manifest.json`

**Interfaces:**
- Produces the canonical file names and layer ordering used by the generation and verification steps.

- [ ] **Step 1: Define the layer order and expression keys**

  Use this order in `manifest.json`: `hair-back`, `body`, `face-base`, `ear`, `eye-left`, `eye-right`, `eyebrow`, `mouth`, `hair-front`, `hat`, `accessory`. Define eye variants `open`, `blink`, `wink-left`, `wink-right`, `happy`, `surprised`; mouth variants `neutral`, `smile`, `open`, `small-o`, `sad`; eyebrow variants `neutral`, `raised`, `angry`, `sad`.

- [ ] **Step 2: Document composition and coordinate rules**

  In `README.md`, state that each file is 1024×1024 RGBA WebP, transparent outside the part, and aligned to the same face center and canvas anchor. Include the exact composition order and a note that the asset set is independent from the existing `anime-face-*` set.

- [ ] **Step 3: Validate the manifest syntax**

  Run: `node -e "JSON.parse(require('fs').readFileSync('public/vtuber-witch/manifest.json','utf8')); console.log('manifest ok')"`

  Expected: `manifest ok`.

- [ ] **Step 4: Commit the manifest**

  Run: `git add public/vtuber-witch/README.md public/vtuber-witch/manifest.json && git commit -m "Add witch VTuber asset manifest"`

### Task 2: Generate the base character layers

**Files:**
- Create: `public/vtuber-witch/witch-hair-back.webp`
- Create: `public/vtuber-witch/witch-body.webp`
- Create: `public/vtuber-witch/witch-face-base.webp`
- Create: `public/vtuber-witch/witch-ear.webp`
- Create: `public/vtuber-witch/witch-eye-left-open.webp`
- Create: `public/vtuber-witch/witch-eye-right-open.webp`
- Create: `public/vtuber-witch/witch-eyebrow-neutral.webp`
- Create: `public/vtuber-witch/witch-mouth-neutral.webp`
- Create: `public/vtuber-witch/witch-hair-front.webp`
- Create: `public/vtuber-witch/witch-hat.webp`
- Create: `public/vtuber-witch/witch-accessory.webp`

**Interfaces:**
- Consumes: the reference image as a style reference only and the manifest from Task 1.
- Produces: aligned transparent base layers with no background or watermark.

- [ ] **Step 1: Generate a coherent base-layer sheet**

  Generate an original chibi witch VTuber with a distinct face shape, asymmetric deep-crimson bob-to-long hair, charcoal-purple witch hat with a crescent clasp, and dark plum dress with teal accent stitching. Request a neutral front-facing pose, clean cel shading, separated layer-ready shapes, no text, no watermark, and a flat solid magenta chroma-key background for local alpha removal.

- [ ] **Step 2: Extract each layer from the generated source**

  Preserve the common 1024×1024 canvas and anchor while isolating each requested layer. Run the local chroma-key removal helper on each opaque generated layer and save RGBA WebP files under `public/vtuber-witch/`.

- [ ] **Step 3: Inspect the layers**

  Check the generated images visually for consistent identity, clean edges, no magenta fringe, and correct front/back occlusion. Regenerate only the affected layer if an edge or identity mismatch is visible.

- [ ] **Step 4: Commit the base layers**

  Run: `git add public/vtuber-witch && git commit -m "Add witch VTuber base layers"`

### Task 3: Generate expression variants

**Files:**
- Create: `public/vtuber-witch/witch-eye-left-{blink,wink-left,happy,surprised}.webp`
- Create: `public/vtuber-witch/witch-eye-right-{blink,wink-right,happy,surprised}.webp`
- Create: `public/vtuber-witch/witch-eyebrow-{raised,angry,sad}.webp`
- Create: `public/vtuber-witch/witch-mouth-{smile,open,small-o,sad}.webp`

**Interfaces:**
- Consumes: the base layer identity and the manifest variant keys.
- Produces: expression-only transparent layers sharing the base anchor and dimensions.

- [ ] **Step 1: Generate eye variants**

  Create blink, left/right wink, happy crescent, and surprised eye variants while preserving iris colors, eyelash style, eye center positions, and the same face alignment.

- [ ] **Step 2: Generate eyebrow variants**

  Create raised, angry, and sad eyebrow layers with transparent pixels everywhere else and identical eyebrow anchor positions.

- [ ] **Step 3: Generate mouth variants**

  Create smile, open-mouth, small-o, and sad mouth layers with the same mouth anchor and consistent line weight.

- [ ] **Step 4: Inspect variant alignment**

  Composite each variant over the neutral base and check that only the intended facial feature changes. Remove any generated background or accidental extra features.

- [ ] **Step 5: Commit expression variants**

  Run: `git add public/vtuber-witch && git commit -m "Add witch VTuber expression layers"`

### Task 4: Build preview and verify WebP outputs

**Files:**
- Create: `public/vtuber-witch/witch-preview.webp`
- Create: `scripts/verify-witch-vtuber-assets.mjs`

**Interfaces:**
- Consumes: `public/vtuber-witch/manifest.json` and all listed WebP layers.
- Produces: a composited neutral preview and a repeatable verification report.

- [ ] **Step 1: Implement metadata validation**

  Use `sharp` to assert that every manifest-listed file exists, has width 1024, height 1024, an alpha channel, and WebP format. Exit non-zero with the file name and failed property when any assertion fails.

- [ ] **Step 2: Implement the neutral preview compositor**

  Composite the manifest layer order with `sharp`, write `public/vtuber-witch/witch-preview.webp`, and preserve transparency outside the character.

- [ ] **Step 3: Run verification**

  Run: `node scripts/verify-witch-vtuber-assets.mjs`

  Expected: every listed layer passes dimension/format/alpha checks and the preview is generated.

- [ ] **Step 4: Inspect the preview**

  View the preview and verify that the character reads as one coherent original design, with no visible chroma-key residue, watermarks, or unintended background.

- [ ] **Step 5: Confirm existing assets are untouched**

  Run: `git diff HEAD~1 -- public/anime-face-* src` and confirm no output attributable to this feature. Then run `git status --short` and review only the new witch asset files.

- [ ] **Step 6: Commit verification tooling and preview**

  Run: `git add scripts/verify-witch-vtuber-assets.mjs public/vtuber-witch/witch-preview.webp && git commit -m "Verify witch VTuber WebP asset set"`

