# Brumaire Local Video Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `/tool` placeholder into a real local video picker with preview, replacement, and removal while preserving the current iOS Native Neutral design.

**Architecture:** A single route-level feature component owns the selected `File`, object URL, native file input ref, and preview error state. The `/tool` route embeds that component in its existing position; CSS extends the existing `ios-*` component layer without changing global tokens or other routes.

**Tech Stack:** React 19, TypeScript, TanStack Start, Tailwind CSS 4, native File and object URL browser APIs

## Global Constraints

- No upload, server function, API route, persistence, analytics, transformation, extension, save, or share implementation.
- Preserve the existing `ios-*` visual system and the layout of `/`, `/tool`, and `/privacy`.
- Use one meaningful `VideoSelection` component; do not split static labels, icons, rows, or buttons into components.
- Revoke every preview object URL on replacement, removal, and unmount.

---

### Task 1: Implement the local selection lifecycle

**Files:**

- Create: `src/features/video-selection/VideoSelection.tsx`

**Interfaces:**

- Produces: `export function VideoSelection(): ReactElement`
- Consumes: native `File`, `HTMLInputElement`, `URL.createObjectURL`, and `URL.revokeObjectURL` APIs.

- [ ] **Step 1: Build the input and initial state**

  Add one visually hidden `<input type="file" accept="video/*">` referenced by `useRef`. The existing-looking selection surface becomes a real `button` that opens that input. Keep the icon, title, and local-only guidance visible.

- [ ] **Step 2: Validate selection and create preview lifecycle**

  Store the selected `File` in state. Reject only a non-empty MIME type that does not start with `video/`. Derive the object URL in an effect keyed by the file and return `URL.revokeObjectURL(previewUrl)` from the effect cleanup.

- [ ] **Step 3: Render selected and failure states**

  Render `<video controls playsInline preload="metadata">` for the object URL. Show filename and formatted byte size. On native media error, retain the file details and announce that the browser cannot preview it. Provide `Choose another` and `Remove` buttons. Reset the native input value before opening it and when clearing so the same file can be chosen again.

### Task 2: Integrate the component without redesigning the page

**Files:**

- Modify: `src/routes/tool.tsx`
- Modify: `src/styles.css`

**Interfaces:**

- Consumes: `VideoSelection` from `#/features/video-selection/VideoSelection`.
- Preserves: the existing tool heading, planned-flow list, local-processing note, mobile width, navigation, tokens, and grouped-card treatment.

- [ ] **Step 1: Replace only the static selection section**

  Import and render `<VideoSelection />` where the current static `ios-selection-group` section lives. Do not alter other tool-page markup or copy.

- [ ] **Step 2: Extend the existing CSS vocabulary**

  Add focused `ios-selection-*` styles for the hidden input, actionable empty surface, native preview, file-detail row, actions, and error message. Reuse `--color-ios-*`, `--radius-ios-grouped`, the 44 px minimum target size, and the existing 560 px page boundary. Do not edit landing/privacy selectors.

### Task 3: Validate behavior and repository hygiene

**Files:**

- Review: `src/features/video-selection/VideoSelection.tsx`
- Review: `src/routes/tool.tsx`
- Review: `src/styles.css`

**Interfaces:**

- Produces: a verified local-only selection flow and a clean handoff.

- [ ] **Step 1: Run focused static validation**

  Run: `pnpm check`, `pnpm typecheck`, and `pnpm build`.

  Expected: all commands exit 0.

- [ ] **Step 2: Exercise the browser flow at mobile width**

  Verify initial picker activation, video selection, preview controls, filename/size, choose-another, remove, same-file reselection, direct route navigation, no overflow, and no console errors. Inspect network activity to confirm selection does not create an application upload request.

- [ ] **Step 3: Review the final diff**

  Confirm only the feature component, tool integration, feature styles, plan/spec documentation, and intentionally generated changes are present. Preserve all existing untracked user files and canvas references.
