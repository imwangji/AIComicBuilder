# Spec: Storyboard Versioning

**Date:** 2026-03-18
**Status:** Approved

## Goal

Every click of "生成分镜" saves the result as a new version. Users can switch between versions and perform all generation operations (frames, videos, scene frames) independently within each version. Data and file storage are fully isolated by version.

## Version Label Format

`YYYYMMDD-Vx` where `x` is a per-project incrementing integer starting at 1.
Example: `20260318-V1`, `20260318-V2`, `20260319-V3`.

---

## Data Model

### New Table: `storyboard_versions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT | Primary key (CUID) |
| `project_id` | TEXT | FK → `projects.id` (CASCADE DELETE) |
| `label` | TEXT | e.g. `"20260318-V1"` |
| `version_num` | INT | Increments per project (1, 2, 3…) |
| `created_at` | INT | Unix timestamp ms |

### `shots` Table: New Column

| Column | Type | Notes |
|--------|------|-------|
| `version_id` | TEXT | FK → `storyboard_versions.id` (CASCADE DELETE), nullable |

### No changes to `projects` table

The active version is tracked purely in frontend state (React `useState`), not persisted server-side.

### Migration

For each project that already has shots:
1. Create a `storyboard_versions` record using `projects.created_at` date as label date, `version_num = 1` (e.g. `"20260310-V1"`).
2. Set `version_id` on all existing shots for that project to the new record's `id`.

Projects with no shots receive no version record; `versions` array will be empty on load.

---

## Version Lifecycle

### Creating a New Version (shot_split)

1. Query `MAX(version_num)` for the project → N (0 if no versions yet).
2. Create `storyboard_versions` record: `version_num = N+1`, `label = "YYYYMMDD-V{N+1}"` (today's date).
3. Insert all new shots with `version_id` pointing to the new record.
4. **Do not delete old shots.** All previous versions remain intact.
5. Return the new `versionId` and `label` in the API response.

### Switching Versions

Pure frontend state update — no API write. Frontend calls `fetchProject(versionId)` with the selected `versionId` to load that version's shots.

### Default Version on Page Load

`fetchProject()` with no `versionId` returns the version with the highest `version_num` (latest). Frontend initialises `selectedVersionId` to this version's `id`.

---

## File Path Isolation

All generated files (first frame, last frame, video, scene ref frame, reference video) use a version-scoped path:

```
uploads/projects/{projectId}/{versionLabel}/{shotId}-first.png
uploads/projects/{projectId}/{versionLabel}/{shotId}-last.png
uploads/projects/{projectId}/{versionLabel}/{shotId}-video.mp4
uploads/projects/{projectId}/{versionLabel}/{shotId}-scene-ref.png
uploads/projects/{projectId}/{versionLabel}/{shotId}-reference-video.mp4
```

All generation handlers (single and batch, in `route.ts` and `pipeline/video-generate.ts`) must resolve the version label by joining `storyboard_versions` via the shot's `version_id` before constructing any file path.

---

## API Changes

### `GET /api/projects/[id]`

New optional query parameter: `?versionId=<id>`

- **With `versionId`**: Return shots where `shots.version_id = versionId`.
- **Without `versionId`**: Return shots for the latest version (highest `version_num`). If no versions exist, return empty shots array.
- **Response body additions:**
  ```json
  {
    "versions": [
      { "id": "...", "label": "20260318-V2", "versionNum": 2, "createdAt": 1234567890000 },
      { "id": "...", "label": "20260318-V1", "versionNum": 1, "createdAt": 1234500000000 }
    ]
  }
  ```
  Ordered by `version_num` descending (newest first).

### `POST /api/projects/[id]/generate` — `shot_split` action

Additional response fields:
```json
{
  "versionId": "...",
  "versionLabel": "20260318-V2"
}
```

Frontend uses these to automatically switch to the new version after generation completes.

### No new endpoints needed for version switching

Version switching is a frontend-only state change followed by a `GET /api/projects/[id]?versionId=xxx`.

---

## Frontend Changes

### `src/stores/project-store.ts`

New type:
```typescript
type StoryboardVersion = {
  id: string;
  label: string;
  versionNum: number;
  createdAt: number;
};
```

`Project` type additions:
```typescript
versions: StoryboardVersion[];   // all versions, newest first
```

### `src/app/[locale]/project/[id]/storyboard/page.tsx`

**New state:**
```typescript
const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
const [versions, setVersions] = useState<StoryboardVersion[]>([]);
```

**`fetchProject` update:** Accept optional `versionId` param and pass it as query string.

**On fetch response:** Populate `versions` state; if `selectedVersionId` is null, initialise it to `versions[0]?.id` (latest).

**After `handleGenerateShots` completes:** Parse `versionId` from response, call `fetchProject(versionId)`, and set `selectedVersionId` to the new version.

**Version switcher component** — placed in the Step 1 controls row, immediately after the "生成分镜" button:

```tsx
{versions.length > 0 && (
  <Select value={selectedVersionId ?? ""} onValueChange={(v) => {
    setSelectedVersionId(v);
    fetchProject(v);
  }}>
    <SelectTrigger size="sm" className="w-36">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {versions.map((v) => (
        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
)}
```

Hidden when `versions.length === 0` (no storyboard generated yet).

### Preview Page & Assembly Page

Read `versionId` from URL query param (`searchParams.get("versionId")`). Pass it when fetching project shots. The storyboard page must append `?versionId={selectedVersionId}` to all navigation links/buttons that go to preview or assembly.

---

## Files Affected

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `storyboard_versions` table; add `version_id` to `shots` |
| `drizzle/0007_add_storyboard_versions.sql` | Migration SQL |
| `drizzle/meta/_journal.json` | Add migration entry |
| `src/app/api/projects/[id]/route.ts` | Filter shots by `versionId`; include `versions` in response |
| `src/app/api/projects/[id]/generate/route.ts` | `shot_split`: create version record, bind shots; all file-path generation uses `versionLabel` |
| `src/lib/pipeline/video-generate.ts` | File path uses `versionLabel` |
| `src/stores/project-store.ts` | Add `StoryboardVersion` type; add `versions` to `Project` |
| `src/app/[locale]/project/[id]/storyboard/page.tsx` | Version state, switcher UI, `fetchProject(versionId)`, navigation links |
| `src/app/[locale]/project/[id]/preview/page.tsx` | Read `versionId` from query params |

## Non-Goals

- No server-side persistence of "current version" on the project record.
- No version deletion UI (versions accumulate; cleanup out of scope).
- No version renaming or descriptions.
- No merging of versions.
- Single-shot rewrite and individual shot edits operate on the shot's existing version — no version branching from edits.
