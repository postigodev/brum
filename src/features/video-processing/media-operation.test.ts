import { describe, expect, it, vi } from "vitest"

import { waitForMediaOperation } from "./media-operation"

describe("bounded media operations", () => {
  it("returns a completed media operation", async () => {
    await expect(waitForMediaOperation(Promise.resolve("done"), { timeoutMs: 50 })).resolves.toBe(
      "done",
    )
  })

  it("cancels a pending operation without waiting for it to settle", async () => {
    const controller = new AbortController()
    const onInterrupt = vi.fn()
    const pending = waitForMediaOperation(new Promise<never>(() => undefined), {
      signal: controller.signal,
      timeoutMs: 1_000,
      onInterrupt,
    })

    controller.abort("test cancellation")

    await expect(pending).rejects.toMatchObject({ code: "canceled" })
    expect(onInterrupt).toHaveBeenCalledOnce()
  })

  it("fails a stalled operation within its configured progress window", async () => {
    const onInterrupt = vi.fn()
    const pending = waitForMediaOperation(new Promise<never>(() => undefined), {
      timeoutMs: 10,
      onInterrupt,
    })

    await expect(pending).rejects.toMatchObject({ code: "media-stalled" })
    expect(onInterrupt).toHaveBeenCalledOnce()
  })

  it("observes a late rejection after cancellation", async () => {
    const controller = new AbortController()
    let rejectOperation: (error: unknown) => void = () => undefined
    const operation = new Promise<never>((_resolve, reject) => {
      rejectOperation = reject
    })
    const pending = waitForMediaOperation(operation, {
      signal: controller.signal,
      timeoutMs: 1_000,
    })

    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: "canceled" })
    rejectOperation(new Error("late failure"))
    await Promise.resolve()
  })
})
