import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

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

describe("VideoSelection browser workflow", () => {
  it("selects a real MP4, creates a boomerang, and exposes the download", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    root.render(createElement(VideoSelection))

    const emptyState = await waitFor(() =>
      document.querySelector<HTMLButtonElement>(".tool-empty-state"),
    )
    expect(emptyState.textContent).toContain("No video selected")

    const response = await fetch(directionalFixtureUrl)
    const file = new File([await response.blob()], "h264-directional.mp4", {
      type: "video/mp4",
    })
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!fileInput) throw new Error("File input was not rendered.")
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))

    await waitFor(() => {
      const mode = inputByValue("loops")
      return mode && !mode.disabled ? mode : null
    })
    inputByValue("loops")?.click()

    await waitFor(() => {
      const target = document.querySelector<HTMLInputElement>(
        'input[name="target-value"][value="2"]',
      )
      return target && !target.disabled ? target : null
    })
    document.querySelector<HTMLInputElement>('input[name="target-value"][value="2"]')?.click()

    const createButton = await waitFor(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.includes("Create boomerang"),
      )
      return button && !button.disabled ? button : null
    })
    createButton.click()

    const download = await waitFor(() =>
      document.querySelector<HTMLAnchorElement>('a[download="h264-directional-brum-2x.mp4"]'),
    )
    expect(download.textContent).toContain("Save video")
    expect(document.querySelector(".tool-ready-badge")?.textContent).toBe("Ready")
    expect(document.querySelector<HTMLVideoElement>(".tool-video-element")?.src).toContain("blob:")
  })
})
