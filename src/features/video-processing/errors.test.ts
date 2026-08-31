import { describe, expect, it } from "vitest"

import { ProcessingError, throwIfAborted, toProcessingError } from "./errors"

describe("ProcessingError", () => {
  it("retains a stable code and cause", () => {
    const cause = new Error("library failure")
    const error = new ProcessingError("invalid-container", "Not an MP4", { cause })
    expect(error).toMatchObject({ code: "invalid-container", cause })
  })

  it("maps an aborted signal to canceled", () => {
    const controller = new AbortController()
    controller.abort("stop")
    expect(() => throwIfAborted(controller.signal)).toThrowError(
      expect.objectContaining({ code: "canceled" }),
    )
  })

  it("wraps unexpected failures", () => {
    const cause = new Error("boom")
    expect(toProcessingError(cause)).toMatchObject({ code: "processing-failed", cause })
  })
})
