import { describe, expect, it, vi } from "vitest"
import { createBoomerangTimeline } from "./boomerang-timeline"
import type { DecodedVideoSample, RetainedVideoFrame } from "./decoded-video-buffer"
import { collectVideoMetadata, emitVideoRanges } from "./decoded-video-ranges"
import { ProcessingDiagnostics } from "./processing-diagnostics"

function sample(index: number): DecodedVideoSample {
  return {
    format: "RGBA",
    visibleRect: { left: 0, top: 0, width: 2, height: 1 },
    timestamp: index / 30,
    duration: 1 / 30,
    codedWidth: 2,
    codedHeight: 1,
    displayWidth: 2,
    displayHeight: 1,
    rotation: 0,
    colorSpace: { primaries: null, transfer: null, matrix: null, fullRange: null },
    allocationSize: () => 8,
    copyTo: vi.fn(async () => [{ offset: 0, stride: 8 }]),
    close: vi.fn(),
  }
}

function source(count: number) {
  const decoded: DecodedVideoSample[] = []
  return {
    decoded,
    async *samples(start = 0, end = Infinity) {
      for (let index = 0; index < count; index++) {
        if (index / 30 < start || index / 30 >= end) continue
        const frame = sample(index)
        decoded.push(frame)
        yield frame
      }
    },
  }
}

describe("bounded decoded ranges", () => {
  it("uses one bounded sequential stream per forward pass across range boundaries", async () => {
    const sink = source(100)
    const metadata = await collectVideoMetadata(sink.samples(), { maxBytes: 24 })
    const tracker = new ProcessingDiagnostics()
    const timeline = createBoomerangTimeline(metadata.frames, 100 / 30, 40 / 3, 1)
    const frames = new Set<RetainedVideoFrame>()
    await emitVideoRanges(
      sink,
      metadata,
      timeline,
      async (frame, entry) => {
        frames.add(frame)
        if (entry.direction === "forward") {
          expect([...frames].filter((value) => value.pixels !== null)).toEqual([frame])
        }
      },
      { maxBytes: 24, diagnostics: tracker },
    )
    expect(tracker.snapshot().decodeStarts?.forward).toBe(2)
    expect(tracker.snapshot().encodedFrames).toBe(timeline.length)
    expect([...frames].every((value) => value.pixels === null)).toBe(true)
    tracker.dispose()
  })

  it.each([
    "complete",
    "failure",
    "cancellation",
  ])("returns the forward iterator after partial output: %s", async (mode) => {
    const metadata = await collectVideoMetadata(source(12).samples())
    const timeline = createBoomerangTimeline(metadata.frames, 0.4, 0.1, 1)
    const controller = new AbortController()
    const closed = vi.fn()
    const sink = {
      async *samples() {
        try {
          for (let i = 0; i < 12; i++) yield sample(i)
        } finally {
          closed()
        }
      },
    }
    const frames: RetainedVideoFrame[] = []
    const pending = emitVideoRanges(
      sink,
      metadata,
      timeline,
      async (frame) => {
        frames.push(frame)
        if (mode === "failure") throw new Error("encode failed")
        if (mode === "cancellation") controller.abort()
      },
      { signal: controller.signal },
    )
    if (mode === "complete") await pending
    else await expect(pending).rejects.toThrow(mode === "failure" ? "encode failed" : "canceled")
    expect(closed).toHaveBeenCalledOnce()
    expect(frames.every((frame) => frame.pixels === null)).toBe(true)
  })

  it("releases reverse range ownership on encoder failure", async () => {
    const sink = source(12)
    const metadata = await collectVideoMetadata(sink.samples())
    const timeline = createBoomerangTimeline(metadata.frames, 0.4, 0.8, 1)
    let reverseFrame: RetainedVideoFrame | undefined
    await expect(
      emitVideoRanges(sink, metadata, timeline, async (frame, entry) => {
        if (entry.direction === "reverse") {
          reverseFrame = frame
          throw new Error("reverse failed")
        }
      }),
    ).rejects.toThrow("reverse failed")
    expect(reverseFrame?.pixels).toBeNull()
    for (const frame of sink.decoded) expect(frame.close).toHaveBeenCalledOnce()
  })

  it("closes a wrong-timestamp forward sample without emitting it", async () => {
    const metadata = await collectVideoMetadata(source(12).samples())
    const timeline = createBoomerangTimeline(metadata.frames, 0.4, 0.1, 1)
    const wrong = sample(1)
    const emit = vi.fn()
    await expect(
      emitVideoRanges(
        {
          async *samples() {
            yield wrong
          },
        },
        metadata,
        timeline,
        emit,
      ),
    ).rejects.toMatchObject({ code: "unsupported-timeline" })
    expect(wrong.close).toHaveBeenCalledOnce()
    expect(emit).not.toHaveBeenCalled()
  })

  it("scans only metadata and closes every sample without copying pixels", async () => {
    const sink = source(300)
    const metadata = await collectVideoMetadata(sink.samples())
    expect(metadata.frames).toHaveLength(300)
    expect(Math.max(...metadata.ranges.map((range) => range.end - range.start))).toBe(8)
    for (const frame of sink.decoded) {
      expect(frame.copyTo).not.toHaveBeenCalled()
      expect(frame.close).toHaveBeenCalledOnce()
    }
  })

  it("emits many cycles with at most one byte-bounded range alive", async () => {
    const sink = source(100)
    const options = { maxBytes: 24 }
    const metadata = await collectVideoMetadata(sink.samples(), options)
    const timeline = createBoomerangTimeline(metadata.frames, 100 / 30, 40 / 3, 1)
    const retained = new Set<RetainedVideoFrame>()
    const seen: number[] = []
    let peak = 0
    await emitVideoRanges(
      sink,
      metadata,
      timeline,
      async (frame) => {
        retained.add(frame)
        const liveBytes = [...retained].reduce(
          (sum, value) => sum + (value.pixels?.byteLength ?? 0),
          0,
        )
        peak = Math.max(peak, liveBytes)
        expect(liveBytes).toBeLessThanOrEqual(24)
        seen.push(frame.timestamp)
      },
      options,
    )
    expect(peak).toBe(24)
    expect(seen).toEqual(timeline.map((entry) => entry.sourceIndex / 30))
    expect([...retained].every((frame) => frame.pixels === null)).toBe(true)
    for (const frame of sink.decoded) expect(frame.close).toHaveBeenCalledOnce()
  })

  it.each([
    "failure",
    "cancellation",
  ])("releases the active range after encode %s", async (mode) => {
    const sink = source(12)
    const metadata = await collectVideoMetadata(sink.samples())
    const timeline = createBoomerangTimeline(metadata.frames, 0.4, 0.8, 1)
    const controller = new AbortController()
    let emitted: RetainedVideoFrame | undefined
    const pending = emitVideoRanges(
      sink,
      metadata,
      timeline,
      async (frame) => {
        emitted = frame
        if (mode === "failure") throw new Error("encoder failed")
        controller.abort()
      },
      { signal: controller.signal },
    )
    await expect(pending).rejects.toThrow(mode === "failure" ? "encoder failed" : "canceled")
    expect(emitted?.pixels).toBeNull()
    for (const frame of sink.decoded) expect(frame.close).toHaveBeenCalledOnce()
  })

  it("rejects a truncated forward stream and releases previously emitted frames", async () => {
    const metadata = await collectVideoMetadata(source(12).samples())
    const timeline = createBoomerangTimeline(metadata.frames, 0.4, 0.8, 1)
    const sink = source(2)
    const emit = vi.fn()
    await expect(emitVideoRanges(sink, metadata, timeline, emit)).rejects.toMatchObject({
      code: "unsupported-timeline",
    })
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit.mock.calls.every(([frame]) => frame.pixels === null)).toBe(true)
    for (const frame of sink.decoded) expect(frame.close).toHaveBeenCalledOnce()
  })

  it("rejects an oversized single frame during the metadata scan", async () => {
    const sink = source(1)
    await expect(collectVideoMetadata(sink.samples(), { maxBytes: 7 })).rejects.toMatchObject({
      code: "decoded-video-memory-exceeded",
    })
    expect(sink.decoded[0]?.copyTo).not.toHaveBeenCalled()
    expect(sink.decoded[0]?.close).toHaveBeenCalledOnce()
  })
})
