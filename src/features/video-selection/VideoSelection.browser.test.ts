import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"
import { userEvent } from "vitest/browser"

import directionalFixtureUrl from "../video-processing/__fixtures__/h264-directional.mp4?url"
import { VideoSelection } from "./VideoSelection"

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  root?.unmount()
  container?.remove()
  root = null
  container = null
})

async function waitFor<T>(read: () => T | null, timeout = 20_000): Promise<T> {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeout) {
    const value = read()
    if (value !== null) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("Timed out waiting for the UI state.")
}

function inputByValue(value: string) {
  return document.querySelector<HTMLInputElement>(`input[value="${value}"]`)
}

function namedInput(name: string, value: string) {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
}

function buttonByText(text: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(text),
  )
}

async function renderWorkflow() {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  root.render(createElement(VideoSelection))

  return waitFor(() => document.querySelector<HTMLButtonElement>(".tool-empty-state"))
}

async function selectFixture(name = "h264-directional.mp4") {
  const response = await fetch(directionalFixtureUrl)
  const file = new File([await response.blob()], name, { type: "video/mp4" })
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!fileInput) throw new Error("File input was not rendered.")

  Object.defineProperty(fileInput, "files", { configurable: true, value: [file] })
  fileInput.dispatchEvent(new Event("change", { bubbles: true }))

  await waitFor(
    () =>
      Array.from(document.querySelectorAll<HTMLInputElement>('input[name="target-value"]')).find(
        (target) => !target.disabled,
      ) ?? null,
  )
}

async function selectCycleTarget(value: string) {
  inputByValue("loops")?.click()
  const target = await waitFor(() => {
    const candidate = namedInput("target-value", value)
    return candidate && !candidate.disabled ? candidate : null
  })
  target.click()
}

async function createResult(filename: string) {
  const createButton = await waitFor(() => {
    const button = buttonByText("Create boomerang")
    return button && !button.disabled ? button : null
  })
  createButton.click()

  return waitFor(() => document.querySelector<HTMLAnchorElement>(`a[download="${filename}"]`))
}

function outputSummary() {
  return document.querySelector<HTMLElement>(".tool-output-summary strong")?.textContent ?? ""
}

describe("VideoSelection browser workflow", () => {
  it("defaults to Boomerang and exposes all speed presets as a keyboard-operable radio group", async () => {
    const emptyState = await renderWorkflow()
    expect(emptyState.textContent).toContain("No video selected")
    await selectFixture()

    const speedFieldset = Array.from(document.querySelectorAll("fieldset")).find(
      (fieldset) => fieldset.querySelector("legend")?.textContent === "Speed",
    )
    const speedRadios = Array.from(
      speedFieldset?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [],
    )
    expect(speedRadios.map(({ name, value }) => ({ name, value }))).toEqual([
      { name: "speed", value: "boomerang" },
      { name: "speed", value: "slowMo" },
      { name: "speed", value: "original" },
    ])
    expect(namedInput("speed", "boomerang")?.checked).toBe(true)
    expect(speedFieldset?.textContent).toContain("Boomerang")
    expect(speedFieldset?.textContent).toContain("Slow Motion")
    expect(speedFieldset?.textContent).toContain("Original")

    namedInput("speed", "boomerang")?.focus()
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => (namedInput("speed", "slowMo")?.checked ? true : null))
    await userEvent.keyboard("{ArrowRight}")
    await waitFor(() => (namedInput("speed", "original")?.checked ? true : null))
  })

  it("replans cycle duration by speed while keeping duration targets exact", async () => {
    await renderWorkflow()
    await selectFixture()
    await selectCycleTarget("2")

    expect(outputSummary()).toBe("2 complete cycles · 16 s · Boomerang.")
    namedInput("speed", "original")?.click()
    expect(outputSummary()).toBe("2 complete cycles · 24 s · Original.")
    namedInput("speed", "slowMo")?.click()
    expect(outputSummary()).toBe("2 complete cycles · 32 s · Slow Motion.")

    inputByValue("duration")?.click()
    const durationTarget = await waitFor(() => {
      const target = namedInput("target-value", "15")
      return target && !target.disabled ? target : null
    })
    durationTarget.click()

    const summaries = []
    for (const speed of ["boomerang", "original", "slowMo"] as const) {
      namedInput("speed", speed)?.click()
      summaries.push(outputSummary())
    }

    expect(summaries).toEqual([
      "15 s exact · 1 complete cycle · final cycle trimmed to 7 s · Boomerang.",
      "15 s exact · 1 complete cycle · final cycle trimmed to 3 s · Original.",
      "15 s exact · 0 complete cycles · final cycle trimmed to 15 s · Slow Motion.",
    ])
  })

  it("invalidates generated results, preserves speed on replacement, and resets to Boomerang", async () => {
    await renderWorkflow()
    await selectFixture()
    await selectCycleTarget("2")

    const firstDownload = await createResult("h264-directional-brum-2x.mp4")
    expect(firstDownload.textContent).toContain("Save video")
    expect(document.querySelector(".tool-ready-badge")?.textContent).toBe("Ready")
    expect(document.querySelector<HTMLVideoElement>(".tool-video-element")?.src).toContain("blob:")

    namedInput("speed", "slowMo")?.click()
    await waitFor(() =>
      document.querySelector('a[download="h264-directional-brum-2x.mp4"]') ? null : true,
    )
    expect(document.querySelector(".tool-ready-badge")).toBeNull()
    expect(outputSummary()).toBe("2 complete cycles · 32 s · Slow Motion.")

    await createResult("h264-directional-brum-2x.mp4")
    await selectFixture("replacement.mp4")
    expect(document.querySelector('a[download="h264-directional-brum-2x.mp4"]')).toBeNull()
    expect(document.querySelector(".tool-ready-badge")).toBeNull()
    expect(namedInput("speed", "slowMo")?.checked).toBe(true)
    expect(outputSummary()).toBe("2 complete cycles · 32 s · Slow Motion.")

    buttonByText("Reset")?.click()
    await waitFor(() => document.querySelector(".tool-empty-state"))
    await selectFixture()
    expect(namedInput("speed", "boomerang")?.checked).toBe(true)
  })
})
