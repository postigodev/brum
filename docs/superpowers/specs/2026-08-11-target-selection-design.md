# Brumaire Target Selection Design

## Purpose

Add the second step of Brumaire's local workflow: choosing how long the selected video should be extended. This step records user intent only; it does not process, transform, export, or upload video.

## Availability

Target controls appear only after a valid local video has been selected. Removing the video also clears the target mode and value. Replacing a valid video may keep the current target because the user's requested output remains meaningful; an invalid replacement clears the workflow state.

## Modes

The selector has two mutually exclusive modes:

- `Duration`: 15, 30, 45, or 60 seconds.
- `Loops`: 2×, 3×, 5×, or 10× total plays of the source clip.

Duration is the initial visible mode, but no target value is selected automatically. Switching modes clears the previous target value so the interface never retains a hidden selection.

## Interface

The mode control uses an accessible radio-backed segmented treatment. Target values use accessible radio rows inside the existing iOS grouped visual system. The selected row uses the existing system-blue accent and a concise checkmark; unselected rows retain the current label and separator treatment.

The block appears after the selected-file information and before the existing Planned flow section. A short status line makes clear that this step only records the target and that extension is not available yet.

## State and Structure

`VideoSelection` continues to own the local workflow state because the selected file and target must eventually be consumed together by the processing step. The implementation may use narrow union types for duration and loop presets, but it must not add global state, context, persistence, URL parameters, or a state-management dependency.

Do not extract decorative wrappers or individual option rows into components. A small local target-selector function is acceptable only if it materially improves readability within the existing feature file.

## Accessibility and Behavior

Native radio inputs provide keyboard selection and group semantics. Mode and target changes are announced through the existing polite status region. Removing the source restores the initial video-selection surface and resets the target state.

## Validation

Run Biome, strict TypeScript, and the production build. In a mobile viewport, verify that controls remain hidden before file selection; all duration and loop presets are selectable; switching mode clears the previous target; direct valid replacement preserves the current mode and value; Remove followed by a new selection starts in Duration with no value; no overflow or console error appears; and no processing or upload request occurs.
