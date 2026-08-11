# Brumaire Initial Application Foundation Design

## Purpose

Brumaire is a small, mobile-first web utility for extending short looping videos to a target duration suitable for Instagram Stories. This foundation establishes the application, navigation, and visual direction without implementing or simulating video processing.

## Scope

The initial application contains three directly addressable routes:

- `/` introduces Brumaire, explains its purpose, links to the tool, and states that processing is intended to happen locally on the user's device.
- `/tool` reserves the future video-selection surface and explains the planned workflow without accepting files or showing controls that do not work.
- `/privacy` provides concise temporary privacy copy covering local processing, the absence of accounts, and the absence of intentional video uploads.

Authentication, databases, APIs, analytics, state-management libraries, video libraries, PWA support, and speculative tests are out of scope.

## Architecture

The project is a single TanStack Start application built with React, TypeScript, Tailwind CSS, and pnpm. It uses TanStack Start file-based routing and a shared site shell for the wordmark, minimal navigation, footer, metadata, and consistent layout.

Route content remains explicit and separate. The foundation does not add server routes, processing services, domain abstractions, or state that future work does not yet require.

## Page Design

### Landing page

The landing page uses a spacious editorial hero with the Brumaire wordmark as its main identity. It includes a concise explanation, one primary call to action linking to `/tool`, and a clear on-device processing statement. It contains no testimonials, pricing, metrics, or marketing filler.

### Tool page

The tool page follows the approved "honest hybrid" direction. A large upload-shaped surface is the visual center and is clearly labeled as unavailable. It is not interactive, does not accept files, and has no preview badge or disabled duration controls. Short supporting copy summarizes the future flow without crowding the upload area.

The reserved area has enough space and a stable layout so a real video-selection component can replace it in the next implementation step without redesigning the page.

### Privacy page

The privacy page is a narrow reading layout with concise, replaceable copy. It states that Brumaire is designed around local processing, currently has no account system, and does not intentionally upload videos.

## Visual Direction

The interface is clean, understated, slightly editorial, and mobile-first. It uses a warm off-white background, near-black text, a restrained muted accent, fine borders, modern typography with an editorial character, and generous negative space. Wider viewports add breathing room rather than dashboard columns.

Decoration is subtle and static. The design avoids gradients as a primary device, glassmorphism, Instagram imitation, excessive cards, and unnecessary animation.

## Behavior and Accessibility

Navigation uses TanStack Start links, and each route supports direct navigation. Semantic landmarks, visible keyboard focus, readable contrast, and reduced-motion-safe styling are required. The unfinished upload surface communicates its status in visible copy and appropriate semantics.

There is no video data flow or simulated processing/error state in this release. The application must not imply that selection, processing, saving, or sharing already works.

## Metadata and Tooling

The root document supplies a concise default title and description. The project uses strict TypeScript and the current linting and formatting setup recommended by the TanStack ecosystem, verified against current documentation before scaffolding.

Package scripts cover development, production build, type checking, linting, formatting, and formatting verification where supported by the selected tooling.

## Validation

After dependencies are installed, validation includes type checking, lint and format checks, and a production build. No placeholder tests are added because the foundation contains no meaningful application behavior beyond routing and static content.

The final diff must exclude unused scaffold examples, generated artifacts, and speculative dependencies.
