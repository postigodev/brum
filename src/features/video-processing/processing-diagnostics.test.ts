import { afterEach, expect, it, vi } from "vitest"
import { ProcessingDiagnostics } from "./processing-diagnostics"

afterEach(() => vi.restoreAllMocks())

it("attributes elapsed time to stages/directions without counting it twice", () => {
  let now = 0
  vi.spyOn(performance, "now").mockImplementation(() => now)
  const tracker = new ProcessingDiagnostics()
  tracker.enter("metadata-scan")
  now = 10
  tracker.enter("range-decode-seek", { direction: "forward" })
  tracker.startDecode("forward")
  now = 30
  tracker.enter("decoded-frame-copy")
  now = 35
  tracker.enter("video-sample-add")
  now = 45
  tracker.enter("range-decode-seek", { direction: "reverse" })
  tracker.startDecode("reverse")
  now = 60
  tracker.enter("output-finalization")
  now = 65
  tracker.enter("output-verification")
  now = 75
  tracker.enter("complete")
  now = 100
  expect(tracker.snapshot()).toMatchObject({
    elapsedMs: 75,
    decodeStarts: { forward: 1, reverse: 1 },
    timingsMs: {
      metadataScan: 10,
      forwardDecode: 20,
      reverseDecode: 15,
      frameCopy: 5,
      avcEncoding: 10,
      finalization: 5,
      verification: 10,
      other: 0,
    },
  })
  tracker.dispose()
})

it("reports ongoing work and freezes failure timing before cleanup", () => {
  let now = 0
  vi.spyOn(performance, "now").mockImplementation(() => now)
  const tracker = new ProcessingDiagnostics()
  tracker.enter("range-decode-seek", { direction: "reverse" })
  now = 15
  expect(tracker.snapshot().timingsMs?.reverseDecode).toBe(15)
  now = 25
  const failure = tracker.failure(new TypeError("decode failed"))
  now = 100
  expect(failure.diagnostic?.elapsedMs).toBe(25)
  expect(tracker.snapshot().timingsMs?.reverseDecode).toBe(25)
  tracker.dispose()
})
