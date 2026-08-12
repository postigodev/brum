import { describe, expect, it } from "vitest"

import {
  assertEstimatedOutputSize,
  assertInputSize,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
} from "./limits"

describe("media size limits", () => {
  it("accepts the exact input and output limits", () => {
    expect(() => assertInputSize(MAX_INPUT_BYTES)).not.toThrow()
    expect(assertEstimatedOutputSize(MAX_OUTPUT_BYTES / 2, 2)).toBe(MAX_OUTPUT_BYTES)
  })

  it("rejects values above either limit", () => {
    expect(() => assertInputSize(MAX_INPUT_BYTES + 1)).toThrowError(
      expect.objectContaining({ code: "input-too-large" }),
    )
    expect(() => assertEstimatedOutputSize(MAX_OUTPUT_BYTES / 2 + 1, 2)).toThrowError(
      expect.objectContaining({ code: "output-too-large" }),
    )
  })
})
