# Reference Image Generation Mode Redesign

## Goal

Upgrade the reference image system from simple path arrays to structured objects with per-image prompts, enabling AI-driven reference image generation with full user control (edit prompt, regenerate, add, delete).

## Architecture

Reference images stored as structured JSON in `shots.referenceImages`. Shot-split prompt outputs `referenceImagePrompts` per shot (1-4 items). Batch generation reads prompts, generates images using character references, updates status. UI shows each ref image as a card with editable prompt, regenerate button, and delete button.

## Data Model

### RefImage Structure (stored as JSON in `shots.referenceImages`)

```typescript
interface RefImage {
  id: string;        // unique id within the shot (nanoid)
  prompt: string;    // image generation prompt (user-editable)
  imagePath?: string; // generated image path (empty = not yet generated)
  status: "pending" | "generated";
}
```

**Migration**: No schema change needed — `referenceImages` column already exists as `TEXT DEFAULT '[]'`. Just change the JSON shape from `string[]` to `RefImage[]`.

**Backwards compat**: Parse logic must handle both legacy `string[]` format (treat each string as `{ prompt: "", imagePath: str, status: "generated" }`) and new `RefImage[]` format.

## Shot-Split Changes

### Prompt Update (`src/lib/ai/prompts/shot-split.ts`)

Add to JSON output schema:
```
"referenceImagePrompts": ["prompt for ref image 1", "prompt for ref image 2"]
```

Guidelines for AI:
- 1-4 reference images per shot
- Character close-ups for face/costume consistency
- Key props or objects that must match across frames
- Environment/setting references for complex backgrounds
- Each prompt must be a complete image generation description

### Pipeline Update (`src/lib/pipeline/shot-split.ts`)

Convert `referenceImagePrompts` strings to `RefImage[]`:
```typescript
referenceImages: JSON.stringify(
  (shotData.referenceImagePrompts || []).map(p => ({
    id: genId(),
    prompt: p,
    status: "pending"
  }))
)
```

## Batch Reference Image Generation

### New action: `batch_ref_image_generate`

In generate route, add handler:

1. Load all shots for the episode/project
2. For each shot, parse `referenceImages` JSON
3. For each entry with `status === "pending"`, generate image using:
   - Entry's `prompt` as the image generation prompt
   - Character reference images for consistency
4. Update entry: set `imagePath` and `status: "generated"`
5. Save updated JSON back to shot

### Blocking Rule

Video generation (both reference and keyframe) should check: all `RefImage` entries must have `status === "generated"` before allowing video generation.

## UI Changes (`src/components/editor/shot-card.tsx`)

### Reference Mode Frame Section

Replace current reference image grid with card-based layout:

```
For each RefImage:
┌────────────────────┐
│  [image or empty]  │
│     🔄  🗑         │  ← hover overlay buttons
├────────────────────┤
│ [editable prompt]  │  ← textarea, auto-save on blur
└────────────────────┘

[+ Add Reference Image]  ← adds empty RefImage card
```

**Card states:**
- `pending` (no imagePath): Show placeholder with "Generate" button
- `generated` (has imagePath): Show image thumbnail with regenerate/delete overlay

**Add flow:**
1. Click "+" → adds `{ id: newId(), prompt: "", status: "pending" }` to array
2. User types prompt in textarea
3. User clicks individual generate button OR waits for batch

**Delete flow:**
1. Click delete → removes entry from array
2. Saves updated JSON to shot

**Regenerate flow:**
1. Click regenerate on a card → set `status: "pending"`, clear `imagePath`
2. Call single ref image generate API with that entry's prompt
3. Update entry on completion

### Batch Generate Button

Below all ref image cards:
```
[Batch Generate Reference Images]  ← generates all pending entries
```

Disabled when no pending entries exist. Shows progress during generation.

## Generate Route Changes

### New endpoints in `handleBatchRefImageGenerate`:

```typescript
// For each shot:
//   Parse referenceImages JSON
//   For each pending entry:
//     Generate image with entry.prompt + character refs
//     Update entry.imagePath and status
//   Save updated JSON
```

### Single ref image generate (for individual regenerate):

Accept `shotId` + `refImageId` in payload. Find the specific entry, generate, update.

## Files to Modify

- `src/lib/ai/prompts/shot-split.ts` — add referenceImagePrompts output
- `src/lib/pipeline/shot-split.ts` — convert prompts to RefImage[]
- `src/app/api/projects/[id]/generate/route.ts` — add batch_ref_image_generate, single_ref_image_generate actions
- `src/components/editor/shot-card.tsx` — redesign reference mode frame section
- `src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx` — add batch ref image button, blocking logic
- `src/stores/project-store.ts` — no change needed (referenceImages already in Shot interface)

## Out of Scope

- Model selector per reference image card (future enhancement)
- Reference video generation changes (stays the same)
- Keyframe mode changes (untouched)
