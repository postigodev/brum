# Local Extension Plan Implementation Plan

> [!WARNING]
> **Historical and superseded.** This completed plan preserves the former `totalPlays` and repeated-forward-play semantics for provenance. Those product semantics are superseded by [#1](https://github.com/postigodev/brumaire/issues/1), where one loop is a forward + reverse cycle. Its checkboxes, constraints, validation records, and embedded agent instructions remain historical evidence and are not current requirements; see the source-of-truth hierarchy in `AGENTS.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read a selected video's local duration and turn a Duration or Loops target into a tested, deterministic extension plan without processing media.

**Architecture:** Keep browser metadata lifecycle and presentation in `VideoSelection`. Put supported presets, validation, and extension mathematics in a pure sibling TypeScript module that can later be consumed by the processing engine. Add Vitest only for this meaningful domain behavior; no DOM test environment or media dependency is needed.

**Tech Stack:** React 19, TypeScript 6, native HTML video metadata, Vitest 4.1, existing TanStack Start/Vite/Tailwind/Biome setup

## Global Constraints

- Duration outputs are exactly 15, 30, 45, or 60 seconds; trim only the final repeated play when required.
- A Duration target is unavailable unless `target - sourceDuration > 0.001` seconds.
- Loop targets are exactly 2×, 3×, 5×, or 10× total complete source plays, including the original.
- Represent no final partial play as `null`, never numeric zero.
- Preserve the existing iOS Native Neutral layout and keep the Target surface compact.
- Do not add processing, output files, workers, FFmpeg, WebCodecs, MediaRecorder, uploads, persistence, APIs, analytics, or simulated progress.
- Do not add jsdom, Testing Library, or component-test dependencies.

---

### Task 1: Tested extension-plan domain module

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/features/video-selection/extension-plan.ts`
- Test: `src/features/video-selection/extension-plan.test.ts`

**Interfaces:**

- Produces: `DURATION_TARGETS`, `LOOP_TARGETS`, `TargetMode`, `ExtensionTarget`, `ExtensionPlan`, `ExtensionPlanResult`, `isDurationTargetAvailable(sourceDuration, target)`, and `createExtensionPlan(sourceDuration, target)`.
- Consumes: no React, browser, media, or network API.

- [x] **Step 1: Install the minimal test runner and scripts**

Run:

```bash
pnpm add -D vitest@^4.1.6
```

Add deterministic and watch scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Expected: `vitest` appears in `devDependencies`; no Vitest config, jsdom, coverage, browser provider, or React testing package is added.

- [x] **Step 2: Write the failing table-driven tests**

Create `src/features/video-selection/extension-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
} from "./extension-plan"

describe("isDurationTargetAvailable", () => {
  it.each([
    { source: 1.4, target: 15, expected: true },
    { source: 15, target: 15, expected: false },
    { source: 14.9995, target: 15, expected: false },
    { source: 14.998, target: 15, expected: true },
    { source: 16, target: 15, expected: false },
  ])("returns $expected for $source s -> $target s", ({ source, target, expected }) => {
    expect(isDurationTargetAvailable(source, target)).toBe(expected)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid source duration %s",
    (source) => {
      expect(isDurationTargetAvailable(source, 15)).toBe(false)
    },
  )
})

describe("createExtensionPlan", () => {
  it("creates an exact divisible duration plan without a partial play", () => {
    expect(createExtensionPlan(1.5, { mode: "duration", value: 15 })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.5,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalPlays: 10,
        completePlays: 10,
        finalPartialDuration: null,
      },
    })
  })

  it("creates an exact non-divisible duration plan with one partial play", () => {
    expect(createExtensionPlan(1.4, { mode: "duration", value: 15 })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.4,
        target: { mode: "duration", value: 15 },
        outputDuration: 15,
        totalPlays: 11,
        completePlays: 10,
        finalPartialDuration: 1,
      },
    })
  })

  it.each([1.49999999, 1.50000001])(
    "normalizes a divisibility boundary for source %s",
    (sourceDuration) => {
      const result = createExtensionPlan(sourceDuration, { mode: "duration", value: 15 })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.plan.totalPlays).toBe(10)
        expect(result.plan.completePlays).toBe(10)
        expect(result.plan.finalPartialDuration).toBeNull()
      }
    },
  )

  it.each(LOOP_TARGETS)("creates a complete %s-play loop plan", (value) => {
    expect(createExtensionPlan(1.25, { mode: "loops", value })).toEqual({
      ok: true,
      plan: {
        sourceDuration: 1.25,
        target: { mode: "loops", value },
        outputDuration: 1.25 * value,
        totalPlays: value,
        completePlays: value,
        finalPartialDuration: null,
      },
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid source duration %s",
    (sourceDuration) => {
      expect(createExtensionPlan(sourceDuration, { mode: "loops", value: 2 })).toEqual({
        ok: false,
        reason: "invalid-source-duration",
      })
    },
  )

  it("rejects a duration target that does not extend the source", () => {
    expect(createExtensionPlan(15, { mode: "duration", value: 15 })).toEqual({
      ok: false,
      reason: "target-does-not-extend",
    })
  })

  it.each([
    { mode: "duration" as const, value: 20 },
    { mode: "loops" as const, value: 4 },
  ])("rejects unsupported target $mode:$value", (target) => {
    expect(createExtensionPlan(1, target)).toEqual({
      ok: false,
      reason: "unsupported-target",
    })
  })

  it("rejects a non-finite loop result", () => {
    expect(createExtensionPlan(Number.MAX_VALUE, { mode: "loops", value: 10 })).toEqual({
      ok: false,
      reason: "non-finite-result",
    })
  })

  it("exports exactly the approved presets", () => {
    expect(DURATION_TARGETS).toEqual([15, 30, 45, 60])
    expect(LOOP_TARGETS).toEqual([2, 3, 5, 10])
  })
})
```

- [x] **Step 3: Run the test to verify the module is missing**

Run:

```bash
pnpm test -- src/features/video-selection/extension-plan.test.ts
```

Expected: FAIL because `./extension-plan` does not exist.

- [x] **Step 4: Implement the pure calculation module**

Create `src/features/video-selection/extension-plan.ts`:

```ts
export const DURATION_TARGETS = [15, 30, 45, 60] as const
export const LOOP_TARGETS = [2, 3, 5, 10] as const

export type TargetMode = "duration" | "loops"

export type ExtensionTarget = {
  mode: TargetMode
  value: number
}

export type ExtensionPlan = {
  sourceDuration: number
  target: ExtensionTarget
  outputDuration: number
  totalPlays: number
  completePlays: number
  finalPartialDuration: number | null
}

export type ExtensionPlanResult =
  | { ok: true; plan: ExtensionPlan }
  | {
      ok: false
      reason:
        | "invalid-source-duration"
        | "unsupported-target"
        | "target-does-not-extend"
        | "non-finite-result"
    }

const DURATION_EPSILON_SECONDS = 0.001

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function includesValue(values: readonly number[], candidate: number) {
  return values.some((value) => value === candidate)
}

export function isDurationTargetAvailable(sourceDuration: number, target: number) {
  return (
    isFinitePositive(sourceDuration) &&
    includesValue(DURATION_TARGETS, target) &&
    target - sourceDuration > DURATION_EPSILON_SECONDS
  )
}

export function createExtensionPlan(
  sourceDuration: number,
  target: ExtensionTarget,
): ExtensionPlanResult {
  if (!isFinitePositive(sourceDuration)) {
    return { ok: false, reason: "invalid-source-duration" }
  }

  const supportedValues = target.mode === "duration" ? DURATION_TARGETS : LOOP_TARGETS
  if (!includesValue(supportedValues, target.value)) {
    return { ok: false, reason: "unsupported-target" }
  }

  if (target.mode === "loops") {
    const outputDuration = sourceDuration * target.value
    if (!isFinitePositive(outputDuration)) {
      return { ok: false, reason: "non-finite-result" }
    }

    return {
      ok: true,
      plan: {
        sourceDuration,
        target,
        outputDuration,
        totalPlays: target.value,
        completePlays: target.value,
        finalPartialDuration: null,
      },
    }
  }

  if (!isDurationTargetAvailable(sourceDuration, target.value)) {
    return { ok: false, reason: "target-does-not-extend" }
  }

  let completePlays = Math.floor(target.value / sourceDuration)
  let remainder = target.value - completePlays * sourceDuration

  if (remainder <= DURATION_EPSILON_SECONDS) {
    remainder = 0
  } else if (sourceDuration - remainder <= DURATION_EPSILON_SECONDS) {
    completePlays += 1
    remainder = 0
  }

  const finalPartialDuration = remainder === 0 ? null : remainder
  const totalPlays = completePlays + (finalPartialDuration === null ? 0 : 1)

  if (![completePlays, totalPlays, target.value].every(isFinitePositive)) {
    return { ok: false, reason: "non-finite-result" }
  }

  return {
    ok: true,
    plan: {
      sourceDuration,
      target,
      outputDuration: target.value,
      totalPlays,
      completePlays,
      finalPartialDuration,
    },
  }
}
```

- [x] **Step 5: Run focused validation and commit the domain unit**

Run:

```bash
pnpm test -- src/features/video-selection/extension-plan.test.ts
pnpm typecheck
pnpm check
```

Expected: all commands exit 0; the test file reports all table cases passing.

Commit only the dependency, lockfile, module, and test:

```bash
git add package.json pnpm-lock.yaml src/features/video-selection/extension-plan.ts src/features/video-selection/extension-plan.test.ts
git commit -m "feat: add local extension planning"
```

---

### Task 2: Local metadata lifecycle and plan presentation

**Files:**

- Modify: `src/features/video-selection/VideoSelection.tsx`

**Interfaces:**

- Consumes: `DURATION_TARGETS`, `LOOP_TARGETS`, `TargetMode`, `createExtensionPlan`, and `isDurationTargetAvailable` from `./extension-plan`.
- Produces: metadata states `loading`, `ready`, and `error`; target invalidation on replacement; compact plan descriptions.

- [x] **Step 1: Replace local preset definitions and add metadata state**

At the top of `VideoSelection.tsx`, replace the local mode and preset constants with:

```ts
import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
  type TargetMode,
} from "./extension-plan"

type MetadataState =
  | { status: "loading" }
  | { status: "ready"; duration: number }
  | { status: "error" }

const TARGET_OPTIONS = {
  duration: DURATION_TARGETS,
  loops: LOOP_TARGETS,
} as const
```

Add beside the existing target state:

```ts
const [metadata, setMetadata] = useState<MetadataState>({ status: "loading" })
```

When `selectedFile` is absent, reset metadata to loading only from explicit Remove/invalid-selection handlers rather than from the object-URL effect.

- [x] **Step 2: Reset and read metadata explicitly**

In the invalid-file branch, before the error copy, add:

```ts
setMetadata({ status: "loading" })
```

Before setting a valid replacement file, add:

```ts
setMetadata({ status: "loading" })
```

In `removeSelection`, add:

```ts
setMetadata({ status: "loading" })
```

Add these focused handlers:

```ts
function handleLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
  const duration = event.currentTarget.duration

  if (!Number.isFinite(duration) || duration <= 0) {
    handleMetadataError()
    return
  }

  setMetadata({ status: "ready", duration })
  setError(null)

  if (
    targetMode === "duration" &&
    targetValue !== null &&
    !isDurationTargetAvailable(duration, targetValue)
  ) {
    setTargetValue(null)
    setStatus("The previous duration does not extend this video. Choose a longer target.")
    return
  }

  setStatus(`Video duration read: ${formatDuration(duration)}.`)
}

function handleMetadataError() {
  setMetadata({ status: "error" })
  setTargetValue(null)
  setError("Brumaire could not read this video's duration. Choose another video.")
  setStatus("Video duration could not be read.")
}
```

Add the formatter beside `formatFileSize`:

```ts
function formatDuration(seconds: number) {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(seconds)} s`
}
```

- [x] **Step 3: Connect the preview and selected-file metadata line**

On the `<video>`, add `key={previewUrl}`, replace the metadata callback, and unify failure handling:

```tsx
key={previewUrl}
onLoadedMetadata={handleLoadedMetadata}
onError={handleMetadataError}
```

Replace the selected-file metadata paragraph body with:

```tsx
{formatFileSize(selectedFile.size)}
{metadata.status === "ready" ? ` · ${formatDuration(metadata.duration)}` : ""} · Local file
```

- [x] **Step 4: Derive availability and a valid plan**

After `activeTargetOptions`, add:

```ts
const sourceDuration = metadata.status === "ready" ? metadata.duration : null
const planResult =
  sourceDuration !== null && targetValue !== null
    ? createExtensionPlan(sourceDuration, { mode: targetMode, value: targetValue })
    : null
const plan = planResult?.ok ? planResult.plan : null

function isTargetDisabled(value: number) {
  if (sourceDuration === null) {
    return true
  }

  return targetMode === "duration" && !isDurationTargetAvailable(sourceDuration, value)
}
```

Replace `targetDescription` with:

```ts
const targetDescription = (() => {
  if (metadata.status === "loading") {
    return "Reading video duration…"
  }

  if (metadata.status === "error") {
    return "Choose another video so Brumaire can calculate an extension plan."
  }

  if (!plan) {
    return "Choose a target. Extension is not available yet."
  }

  if (plan.target.mode === "loops") {
    return `${plan.totalPlays} total plays · ${formatDuration(plan.outputDuration)} output. Extension is not available yet.`
  }

  const trimCopy =
    plan.finalPartialDuration === null
      ? "complete plays only"
      : `final play trimmed to ${formatDuration(plan.finalPartialDuration)}`

  return `${formatDuration(plan.outputDuration)} exact · ${plan.totalPlays} total plays · ${trimCopy}. Extension is not available yet.`
})()
```

- [x] **Step 5: Disable unavailable rows and label them visibly**

Inside the target-options map, calculate:

```tsx
const disabled = isTargetDisabled(value)
const unavailable =
  metadata.status === "ready" && targetMode === "duration" && disabled
```

Use `disabled={disabled}` on the radio. Replace the existing text/check spans with:

```tsx
<span>{targetMode === "duration" ? `${value} seconds` : `${value}× total plays`}</span>
<span className="ios-target-option-trailing">
  {unavailable ? (
    <span className="ios-target-unavailable">Unavailable</span>
  ) : (
    <span className="ios-target-check" aria-hidden="true">
      {targetValue === value ? "✓" : ""}
    </span>
  )}
</span>
```

Because JSX does not allow a declaration directly inside an implicit-return arrow, change the map callback to a block body that returns the `<label>`.

- [x] **Step 6: Run behavior-oriented static checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm check
```

Expected: all exit 0; no unsafe cast, ignored error, or disabled check is introduced.

Do not commit yet; Task 3 completes the same user-facing behavior with its visual and documentation contract.

---

### Task 3: Native styling, honest copy, and end-to-end validation

**Files:**

- Modify: `src/styles.css`
- Modify: `src/routes/tool.tsx`
- Modify: `README.md`
- Review: `src/features/video-selection/VideoSelection.tsx`

**Interfaces:**

- Consumes: disabled inputs and `ios-target-option-trailing` / `ios-target-unavailable` markup from Task 2.
- Produces: visibly unavailable rows, accurate workflow copy, and a fully validated local planning step.

- [x] **Step 1: Add disabled-row and trailing-label styles**

Add after `.ios-target-option`:

```css
.ios-target-option:has(input:disabled) {
  color: var(--color-ios-secondary);
  cursor: default;
}

.ios-target-option-trailing {
  display: flex;
  min-width: 78px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
}

.ios-target-unavailable {
  color: var(--color-ios-secondary);
  font-size: 0.8125rem;
  font-weight: 400;
}
```

Keep the existing checkmark width and focus rules unchanged; disabled radios do not receive focus.

- [x] **Step 2: Correct the planned-flow and README status copy**

In `src/routes/tool.tsx`, replace:

```tsx
<div className="ios-group-row">Choose a duration</div>
```

with:

```tsx
<div className="ios-group-row">Choose a target</div>
```

In `README.md`, replace the current note with:

```md
> [!NOTE]
> Local video selection, preview, target choice, and extension planning are implemented.
> Video processing, export, and sharing are not available yet.
```

Add `pnpm test` to the Validation command block.

- [x] **Step 3: Format and run the complete automated validation**

Run:

```bash
pnpm format
pnpm test
pnpm check
pnpm typecheck
pnpm build
```

Expected: every command exits 0; Vitest reports the domain suite passing; Vite produces both client and SSR builds.

- [x] **Step 4: Validate the workflow at a mobile viewport**

Create disposable local fixtures outside the repository. FFmpeg is used only as a validation tool and is not added to the application, package manifest, or tracked files:

```powershell
$fixtureDir = Join-Path $env:TEMP "brumaire-extension-plan-fixtures"
New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null
ffmpeg -y -f lavfi -i "color=c=blue:s=180x320:r=10:d=1.5" -c:v libx264 -pix_fmt yuv420p -movflags +faststart (Join-Path $fixtureDir "divisible-1.5s.mp4")
ffmpeg -y -f lavfi -i "color=c=blue:s=180x320:r=10:d=1.4" -c:v libx264 -pix_fmt yuv420p -movflags +faststart (Join-Path $fixtureDir "trimmed-1.4s.mp4")
ffmpeg -y -f lavfi -i "color=c=blue:s=180x320:r=10:d=20" -c:v libx264 -pix_fmt yuv420p -movflags +faststart (Join-Path $fixtureDir "invalidates-20s.mp4")
ffmpeg -y -f lavfi -i "color=c=blue:s=180x320:r=10:d=61" -c:v libx264 -pix_fmt yuv420p -movflags +faststart (Join-Path $fixtureDir "long-61s.mp4")
Copy-Item -LiteralPath "README.md" -Destination (Join-Path $fixtureDir "invalid-metadata.mp4") -Force
```

Confirm each generated duration with:

```powershell
Get-ChildItem -LiteralPath $fixtureDir -Filter "*.mp4" | ForEach-Object {
  ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -i $_.FullName
}
```

Run the local app and test at approximately `390 × 844` with those absolute fixture paths. Verify:

1. Before selection, Target is absent.
2. After selection, rows are disabled only while metadata loads, then the file line shows duration.
3. A short clip enables all approved Duration and Loop presets.
4. Selecting 45 seconds shows exact output, total plays, and final-trim copy when non-divisible.
5. Selecting 5× shows five complete plays and calculated output duration.
6. Duration options at or below the source are visibly `Unavailable` and cannot be selected by pointer or keyboard.
7. A 60+ second clip leaves all Duration rows unavailable while Loop mode remains selectable; the mode does not switch automatically.
8. Replacing a source preserves a Loop target; it preserves a Duration target only when still valid and otherwise clears it with the approved explanation.
9. Remove restores Duration mode with no target or stale metadata.
10. Invalid metadata shows visible and announced error copy.
11. No horizontal overflow or console warning/error appears.
12. Source search and browser activity show no fetch, upload, server function, blob output, or processing request.

- [x] **Step 5: Review the diff and commit the integrated UI**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: changes are limited to Task 2 and Task 3 files; no generated `dist/`, fixture video, temporary file, or unrelated scaffold output is tracked.

Commit:

```bash
git add README.md src/features/video-selection/VideoSelection.tsx src/routes/tool.tsx src/styles.css
git commit -m "feat: show local extension plans"
```

Do not push without separate approval.
