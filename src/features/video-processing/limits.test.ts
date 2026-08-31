import { describe, expect, it } from "vitest"

import {
  assertActualOutputSize,
  assertInputSize,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
} from "./limits"

describe("media size limits", () => {
  it("accepts the exact input and output limits", () => {
    expect(() => assertInputSize(MAX_INPUT_BYTES)).not.toThrow()
    expect(() => assertActualOutputSize(MAX_OUTPUT_BYTES)).not.toThrow()
  })

  it("rejects values above either limit", () => {
    expect(() => assertInputSize(MAX_INPUT_BYTES + 1)).toThrowError(
      expect.objectContaining({ code: "input-too-large" }),
    )
    expect(() => assertActualOutputSize(MAX_OUTPUT_BYTES + 1)).toThrowError(
      expect.objectContaining({ code: "output-too-large" }),
    )
  })
})
