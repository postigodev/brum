import { canEncodeAudio } from "mediabunny"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ensureAacEncoder } from "./audio-capabilities"

vi.mock("mediabunny", () => ({
  canDecodeAudio: vi.fn(),
  canEncodeAudio: vi.fn(),
}))

describe("AAC encoding capability", () => {
  beforeEach(() => {
    vi.mocked(canEncodeAudio).mockReset()
  })

  it("checks the requested numeric bitrate", async () => {
    vi.mocked(canEncodeAudio).mockResolvedValue(true)

    await ensureAacEncoder(48_000, 2, 128_000)

    expect(canEncodeAudio).toHaveBeenCalledWith("aac", {
      sampleRate: 48_000,
      numberOfChannels: 2,
      bitrate: 128_000,
    })
  })
})
