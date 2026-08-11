# Brumaire Local Video Selection Design

## Purpose

Replace the static `Video selection` placeholder with a real local file-selection flow while preserving the current iOS Native Neutral design exactly as the visual foundation.

This block stops after selection and local preview. It does not extend, transform, upload, save, or share video.

## Interaction

The existing selection surface becomes an accessible activation target backed by a native `<input type="file" accept="video/*">`. Before selection, it keeps the current icon, `Video selection` title, grouped surface, spacing, and blue accent.

After selection, the same bounded surface displays a native video preview with controls and `playsInline`. Supporting information identifies the local filename and file size. Compact actions allow the user to choose another file or remove the current selection.

No autoplay is used. Choosing the same file again must work after removal or replacement.

## Local Data Lifecycle

The selected `File` remains in browser memory. The preview uses an object URL created with `URL.createObjectURL()` and revokes that URL whenever the selection changes or the component unmounts.

No file bytes, metadata, or analytics are sent over the network. No server function, API route, persistence layer, upload client, or video-processing dependency is introduced.

## Failure States

The picker rejects a file only when the browser provides a non-video MIME type. An empty MIME type is allowed so valid videos from platforms that omit it are not rejected prematurely.

If the browser cannot decode the selected video for preview, the selected file remains visible and the surface shows concise guidance to choose another browser-supported video. Errors are announced through an `aria-live` region.

## Structure

The stateful selection and object-URL lifecycle belong in one focused `VideoSelection` component under `src/features/video-selection/`. This extraction is justified by meaningful behavior and keeps the route focused; it must not be split into wrapper components for individual labels, icons, rows, or buttons.

The `/tool` route replaces only its existing static selection section with this component. The landing page, privacy page, navigation, copy outside the selection block, tokens, widths, typography, grouped-list treatment, and overall layout remain unchanged.

## Validation

Run Biome checks, strict TypeScript, and the production build. In a mobile viewport, verify initial selection, file choice, native preview, replacement, removal, same-file reselection, invalid-type handling where practical, no horizontal overflow, and no unexpected console errors or network uploads.
