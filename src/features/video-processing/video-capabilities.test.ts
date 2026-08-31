import { canEncodeVideo } from "mediabunny"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  assertAvcEncoderAvailable,
  assertVideoDecoderAvailable,
  createAvcEncodingConfig,
} from "./video-capabilities"

vi.mock("mediabunny", async (importOriginal) => ({
  ...(await importOriginal<typeof import("mediabunny")>()),
  canEncodeVideo: vi.fn(),
}))

describe("video capabilities", () => {
  beforeEach(() => vi.mocked(canEncodeVideo).mockReset())

  it("reports an unavailable decoder before decoding", async () => {
    await expect(
      assertVideoDecoderAvailable({ canDecode: vi.fn().mockResolvedValue(false) }),
    ).rejects.toMatchObject({ code: "video-decoder-unavailable" })
  })

  it("allows a supported decoder", async () => {
    await expect(
      assertVideoDecoderAvailable({ canDecode: vi.fn().mockResolvedValue(true) }),
    ).resolves.toBeUndefined()
  })

  it("uses the production AVC configuration for encoder detection", async () => {
    vi.mocked(canEncodeVideo).mockResolvedValue(true)
    const config = createAvcEncodingConfig(2_000_000)

    await assertAvcEncoderAvailable(config, 1920, 1080)

    expect(canEncodeVideo).toHaveBeenCalledWith("avc", {
      width: 1920,
      height: 1080,
      quality: config.quality,
    })
  })

  it("reports an unavailable AVC encoder", async () => {
    vi.mocked(canEncodeVideo).mockResolvedValue(false)

    await expect(
      assertAvcEncoderAvailable(createAvcEncodingConfig(2_000_000), 1920, 1080),
    ).rejects.toMatchObject({ code: "video-encoder-unavailable" })
  })
})
