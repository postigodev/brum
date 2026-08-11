# Brumaire Target Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add controlled Duration and Loops target presets after local video selection without starting video processing.

**Architecture:** Extend the existing `VideoSelection` workflow state with a narrow mode union and nullable preset value. Render native controlled radios inside the current feature component and extend only the existing iOS component styles.

**Tech Stack:** React 19 controlled inputs, TypeScript, existing TanStack Start and Tailwind CSS setup

## Global Constraints

- Duration presets are exactly 15, 30, 45, and 60 seconds.
- Loop presets are exactly 2×, 3×, 5×, and 10× total source plays.
- No default target value, processing, upload, persistence, global state, or new dependency.
- Preserve the current iOS Native Neutral layout and tokens.

---

### Task 1: Add target state and accessible controls

**Files:**

- Modify: `src/features/video-selection/VideoSelection.tsx`

**Interfaces:**

- Adds: `type TargetMode = "duration" | "loops"`
- Adds: controlled `targetMode` and nullable `targetValue` local state.

- [x] **Step 1: Define typed presets and reset transitions**

  Define readonly duration and loop arrays. Mode change sets the new mode and clears `targetValue`. Remove and invalid replacement reset mode to `duration` and value to `null`; valid replacement leaves both unchanged.

- [x] **Step 2: Render mode and target radio groups**

  After selected-file actions, render a fieldset with a radio-backed segmented mode control and a second fieldset with four preset rows for the active mode. Use `checked` and `onChange` for every controlled input. Announce each chosen target through the existing polite status region.

- [x] **Step 3: Keep the boundary honest**

  Show concise copy that the target is recorded locally but extension is not available. Do not add a Continue, Process, Export, Save, or Share action.

### Task 2: Extend the existing iOS styles and documentation

**Files:**

- Modify: `src/styles.css`
- Modify: `README.md`

**Interfaces:**

- Adds: focused `ios-target-*` styles reusing existing grouped colors, radii, separators, and 44 px controls.

- [x] **Step 1: Style the segmented and grouped radio controls**

  Keep native inputs accessible while presenting mode labels as a two-segment control. Present target values as full-width grouped rows with a blue checkmark for the selected option. Preserve the existing 560 px boundary and mobile spacing.

- [x] **Step 2: Update current-status documentation**

  State that local video selection, preview, and target choice are implemented while processing/export/sharing remain unavailable.

### Task 3: Validate and commit

**Files:**

- Review: `src/features/video-selection/VideoSelection.tsx`
- Review: `src/styles.css`
- Review: `README.md`

**Interfaces:**

- Produces: a verified and committed second workflow step.

- [x] **Step 1: Run static validation**

  Run `pnpm format`, `pnpm check`, `pnpm typecheck`, and `pnpm build`; require exit 0.

- [x] **Step 2: Run mobile browser validation**

  Verify controls are absent before file selection; all eight presets work; mode switch clears selection; valid replacement preserves selection; Remove and reselection reset to Duration/no value; no overflow or console errors appear.

- [ ] **Step 3: Review and commit**

  Confirm the diff is limited to the feature, styles, README, and approved planning artifacts. Commit with a focused Conventional Commit message without pushing.
