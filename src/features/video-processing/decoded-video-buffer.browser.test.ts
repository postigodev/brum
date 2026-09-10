import { VideoSample } from "mediabunny"
import { describe, expect, it } from "vitest"
import {
  createVideoSampleFromRetainedFrame,
  detachDecodedVideoSample,
  releaseRetainedVideoFrame,
} from "./decoded-video-buffer"
import { ProcessingDiagnostics } from "./processing-diagnostics"

describe("native pixel reconstruction", () => {
  it.each([
    { format: "NV12", bytes: 24, planes: 2 },
    { format: "I420", bytes: 24, planes: 3 },
    { format: "RGBA", bytes: 64, planes: 1 },
    { format: "BGRA", bytes: 64, planes: 1 },
  ] as const)("reconstructs native $format at the encoder VideoFrame boundary", async ({
    format,
    bytes,
    planes,
  }) => {
    const pixels = Uint8Array.from({ length: bytes }, (_, index) => index + 16)
    const native = new VideoFrame(pixels, { format, codedWidth: 4, codedHeight: 4, timestamp: 0 })
    const retained = await detachDecodedVideoSample(new VideoSample(native))
    const restored = createVideoSampleFromRetainedFrame(retained, 1, 0.5)
    try {
      expect(retained.pixels?.byteLength).toBe(bytes)
      expect(retained.copyLayout).toHaveLength(planes)
      expect(restored.format).toBe(format)
      const encodedInput = restored.toVideoFrame()
      try {
        expect(encodedInput.format).toBe(format)
        const copied = new Uint8Array(encodedInput.allocationSize())
        expect(await encodedInput.copyTo(copied)).toHaveLength(planes)
        expect(copied).toEqual(pixels)
      } finally {
        encodedInput.close()
      }
    } finally {
      restored.close()
      releaseRetainedVideoFrame(retained)
    }
  })

  it("preserves cropped pixels, geometry, rotation, timing and color", async () => {
    const pixels = new Uint8Array(4 * 4 * 4)
    for (let index = 0; index < 16; index++) pixels.set([index * 10, 30, 50, 255], index * 4)
    const backing = new VideoFrame(pixels, {
      format: "RGBA",
      codedWidth: 4,
      codedHeight: 4,
      timestamp: 0,
      duration: 500_000,
      colorSpace: { primaries: "bt709", transfer: "iec61966-2-1", matrix: "rgb", fullRange: true },
    })
    const native = new VideoFrame(backing, {
      visibleRect: { x: 1, y: 1, width: 2, height: 2 },
      displayWidth: 6,
      displayHeight: 4,
    })
    backing.close()
    const decoded = new VideoSample(native, { rotation: 90 })
    const sourceVisibleRect = { ...decoded.visibleRect }
    // VideoSample owns this native frame; detachment closes it after copying.
    const diagnostics = new ProcessingDiagnostics()
    const retained = await detachDecodedVideoSample(decoded, { diagnostics })
    const restored = createVideoSampleFromRetainedFrame(retained, 2, 0.25)
    try {
      expect(retained.pixels?.byteLength).toBe(16)
      expect(retained.copyLayout).toHaveLength(1)
      expect(restored.rotation).toBe(90)
      expect([restored.displayWidth, restored.displayHeight]).toEqual([4, 6])
      expect(restored.timestamp).toBe(2)
      expect(restored.duration).toBe(0.25)
      expect(restored.colorSpace.primaries).toBe("bt709")
      expect(restored.colorSpace.transfer).toBe("iec61966-2-1")
      expect(restored.colorSpace.matrix).toBe("rgb")
      expect(restored.colorSpace.fullRange).toBe(true)
      // This is the actual native boundary reached by VideoSampleSource.add().
      const encodedInput = restored.toVideoFrame()
      try {
        expect([encodedInput.codedWidth, encodedInput.codedHeight]).toEqual([2, 2])
        expect(encodedInput.visibleRect?.x).toBe(0)
        expect(encodedInput.visibleRect?.y).toBe(0)
        const copied = new Uint8Array(encodedInput.allocationSize())
        expect(await encodedInput.copyTo(copied)).toEqual([{ offset: 0, stride: 8 }])
        expect([...copied]).toEqual([5, 6, 9, 10].flatMap((index) => [index * 10, 30, 50, 255]))
      } finally {
        encodedInput.close()
      }
      expect(diagnostics.snapshot().pixelFrame).toMatchObject({
        pixelFormat: "RGBA",
        pixelBufferBytes: 16,
        codedWidth: 2,
        codedHeight: 2,
        sourceVisibleRect,
      })
    } finally {
      restored.close()
      releaseRetainedVideoFrame(retained)
      diagnostics.dispose()
    }
  })
})
