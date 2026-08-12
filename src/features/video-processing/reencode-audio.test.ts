import { EncodedPacket } from "mediabunny"
import { describe, expect, it } from "vitest"

import { fitEncodedPacketsToDuration } from "./reencode-audio"

describe("encoded AAC duration fitting", () => {
  it("shortens encoder padding on the final packet", () => {
    const packets = [0, 1024, 2048].map((frame) => ({
      packet: new EncodedPacket(
        new Uint8Array([frame / 1024]),
        "key",
        frame / 48_000,
        1024 / 48_000,
      ),
      metadata: undefined,
    }))

    const fitted = fitEncodedPacketsToDuration(packets, 0.05)

    expect(fitted).toHaveLength(3)
    const last = fitted.at(-1)
    expect(last).toBeDefined()
    expect((last?.packet.timestamp ?? 0) + (last?.packet.duration ?? 0)).toBeCloseTo(0.05, 9)
    expect(fitted.at(-1)?.packet.data).toEqual(packets.at(-1)?.packet.data)
  })
})
