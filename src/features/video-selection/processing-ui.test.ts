import { describe, expect, it } from "vitest"

import { outputFilename, processingErrorMessage } from "./processing-ui"

describe("processing UI contracts", () => {
  it("maps technical capability failures to user-facing copy", () => {
    expect(processingErrorMessage("video-decoder-unavailable")).toContain("cannot decode")
    expect(processingErrorMessage("video-encoder-unavailable")).toContain("cannot create")
    expect(processingErrorMessage("decoded-video-memory-exceeded")).toContain("decoded memory")
    expect(processingErrorMessage("processing-failed")).toContain("could not create")
  })

  it("creates a safe duration output filename", () => {
    expect(outputFilename("My Boomerang #1.MOV", { mode: "duration", value: 15 })).toBe(
      "My-Boomerang-1-brumaire-15s.mp4",
    )
  })

  it("creates a loop output filename without trusting the source name", () => {
    expect(outputFilename("💀.mp4", { mode: "loops", value: 3 })).toBe("video-brumaire-3x.mp4")
  })
})
