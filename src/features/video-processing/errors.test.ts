import { describe, expect, it } from "vitest"

import { RemuxError, throwIfAborted, toRemuxError } from "./errors"

describe("RemuxError", () => {
  it("retains a stable code and cause", () => {
    const cause = new Error("library failure")
    const error = new RemuxError("invalid-container", "Not an MP4", { cause })
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
    expect(toRemuxError(cause)).toMatchObject({ code: "remux-failed", cause })
  })
})
