# Brumaire Local Extension Plan Design

> [!WARNING]
> **Historical and superseded.** This design records the former total-forward-play extension semantics. [#1](https://github.com/postigodev/brumaire/issues/1) supersedes them with forward + reverse boomerang cycles. The design remains unchanged below as historical evidence and is not a current requirement; see the source-of-truth hierarchy in `AGENTS.md`.

## Purpose

Add the third step of Brumaire's local workflow: read the selected video's duration and turn the chosen target into a deterministic extension plan. This step explains what a future processor must produce without encoding, transforming, exporting, or uploading video.

## Product Semantics

Duration targets produce an exact output length. Brumaire repeats the source as many times as necessary and, when the target is not evenly divisible by the source duration, trims only the final play.

Brumaire remains an extension tool rather than a trimming tool. A duration preset is unavailable when it is less than or effectively equal to the source duration. Comparisons use a `0.001` second tolerance so floating-point metadata noise does not expose a meaningless near-zero extension.

Loop targets continue to mean total source plays, including the original play. They always use complete plays and therefore never require a final trim. If a source is 60 seconds or longer, all duration presets may be unavailable while Loop mode remains available; the interface does not switch modes automatically.

## Architecture

`VideoSelection` continues to own the selected file, object URL, preview, target mode, and target value. It also owns the browser metadata lifecycle because the existing preview `<video>` is the source of `duration`.

A focused pure TypeScript module under `src/features/video-selection/` owns the extension mathematics. It has no React, DOM, media, or network dependencies. The module accepts a finite positive source duration and a target discriminated by mode, then returns either a normalized plan or an explicit invalid result.

The module exposes enough information for both this interface and the future processing engine:

- source duration;
- requested mode and value;
- exact planned output duration;
- total source plays required;
- complete source plays;
- final partial-play duration when trimming is required.

The module also provides the duration-preset availability rule so the interface and calculation cannot disagree. This is a narrow domain boundary, not a general media abstraction.

## Calculations

For a duration target `T` and source duration `S`:

- the target is valid only when `T - S > 0.001` seconds;
- begin with complete plays equal to `floor(T / S)` and a remainder of `T - completePlays * S`;
- a remainder at most `0.001` seconds is treated as zero;
- a remainder within `0.001` seconds of `S` is treated as a complete additional play, incrementing complete plays and normalizing the remainder to zero;
- the final partial-play duration is `null` when the normalized remainder is zero and otherwise equals that remainder;
- total plays equal complete plays when the final partial-play duration is `null`, otherwise complete plays plus one;
- planned output duration is exactly `T`.

For a loop target `N`:

- total and complete plays are both `N`;
- there is no final partial play;
- planned output duration is `S * N`.

All numeric inputs and exposed numeric results must be finite and positive. The absence of a final partial play is represented by `null`, never by an exposed zero duration. The pure module rejects invalid source metadata and unsupported target values rather than manufacturing a plan.

## Metadata Lifecycle

Selecting or replacing a file clears metadata from the previous file and enters a loading state. `VideoSelection` reads `event.currentTarget.duration` from the preview video's metadata event. A finite positive value moves the workflow to ready; a missing, infinite, zero, or otherwise invalid value moves it to an error state.

While metadata is loading, the target block remains visible but its preset rows are not selectable. The mode control may remain available. If metadata cannot be read, Brumaire explains that it cannot calculate a plan and asks the user to choose another video.

Removing a file clears its metadata and preserves the existing full workflow reset. A valid replacement initially preserves the current target mode and value, as before. Once the new metadata is ready, a Loop target remains selected; a Duration target remains selected only if it is still valid for the new source. An invalid preserved duration is cleared with a concise explanation.

## Interface

The selected-file metadata line adds the source duration once available, for example `2.2 MB · 1.4 s · Local file`. Loading and failure copy remain concise and replaceable.

Unavailable duration rows remain visible in the grouped list, use native disabled semantics, appear visually muted, and include an `Unavailable` label. Brumaire does not silently select another target or change modes.

After the user selects a valid target, a compact summary replaces the generic target note. Duration summaries state the exact output duration, required total plays, and whether the final play is trimmed. Loop summaries state total plays and planned output duration. This remains supporting text within the existing Target section rather than a new card or dashboard.

No Continue, Process, Export, Save, or Share control is added. No progress state, output blob, codec claim, or simulated processing appears.

## Errors and Accessibility

Metadata loading, success, invalidated replacement targets, and failures are announced through the existing polite status region. A metadata failure also has visible error copy.

Disabled duration presets use actual disabled radio inputs so they cannot be activated by pointer or keyboard. The visible unavailable annotation does not rely on color alone. Existing fieldset, legend, radio, focus, and touch-target semantics remain intact.

## Testing and Validation

The extension calculation is meaningful domain behavior, so add Vitest as a development dependency without jsdom or component-testing packages. Use a deterministic `vitest run` package script and table-driven unit tests for:

- exact divisibility without a partial play;
- non-divisible duration targets with a final trim;
- each supported Loop target;
- targets less than, equal to, and greater than the source;
- floating-point boundary normalization for remainders near both zero and one complete source play;
- invalid or non-finite source durations;
- unsupported target values.

Run the unit tests, Biome checks, strict TypeScript checking, and the production build. In a mobile browser, verify metadata display, loading and error behavior, disabled duration rows, exact-plan summaries, Loop summaries, replacement invalidation, reset behavior, keyboard semantics, no horizontal overflow, no console errors, and no processing or upload request.

## Non-goals

This step does not choose codecs or containers, inspect audio/video tracks, estimate file size, read frame rate or dimensions, process media, create output files, persist state, or introduce workers, WebAssembly, FFmpeg, MediaRecorder, WebCodecs, backend APIs, or analytics.
