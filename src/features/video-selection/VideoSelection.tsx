import { useEffect, useRef, useState } from "react"
import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
  type TargetMode,
} from "./extension-plan"

type MetadataState =
  | { status: "loading" }
  | { status: "ready"; duration: number }
  | { status: "error" }

const TARGET_OPTIONS = {
  duration: DURATION_TARGETS,
  loops: LOOP_TARGETS,
} as const

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ["KB", "MB", "GB"]
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1)
  const value = bytes / 1024 ** (unitIndex + 1)

  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`
}

function formatDuration(seconds: number) {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(seconds)} s`
}

export function VideoSelection() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("No video selected.")
  const [targetMode, setTargetMode] = useState<TargetMode>("duration")
  const [targetValue, setTargetValue] = useState<number | null>(null)
  const [metadata, setMetadata] = useState<MetadataState>({ status: "loading" })

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  function openPicker() {
    const input = inputRef.current

    if (!input) {
      return
    }

    input.value = ""
    input.click()
  }

  function handleSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]

    if (!file) {
      return
    }

    if (file.type && !file.type.startsWith("video/")) {
      setSelectedFile(null)
      resetTarget()
      setMetadata({ status: "loading" })
      setError("Choose a video file to continue.")
      setStatus("The selected file is not a video.")
      event.currentTarget.value = ""
      return
    }

    setError(null)
    setMetadata({ status: "loading" })
    setSelectedFile(file)
    setStatus(`${file.name} selected. The file remains on this device.`)
  }

  function removeSelection() {
    setSelectedFile(null)
    resetTarget()
    setMetadata({ status: "loading" })
    setError(null)
    setStatus("Video removed.")

    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  function resetTarget() {
    setTargetMode("duration")
    setTargetValue(null)
  }

  function changeTargetMode(mode: TargetMode) {
    setTargetMode(mode)
    setTargetValue(null)
    setStatus(`${mode === "duration" ? "Duration" : "Loops"} mode selected. Choose a target.`)
  }

  function selectTarget(value: number) {
    setTargetValue(value)
    setStatus(
      targetMode === "duration"
        ? `Target set to ${value} seconds. Extension has not started.`
        : `Target set to ${value} total plays. Extension has not started.`,
    )
  }

  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
    const duration = event.currentTarget.duration

    if (!Number.isFinite(duration) || duration <= 0) {
      handleMetadataError()
      return
    }

    setMetadata({ status: "ready", duration })
    setError(null)

    if (
      targetMode === "duration" &&
      targetValue !== null &&
      !isDurationTargetAvailable(duration, targetValue)
    ) {
      setTargetValue(null)
      setStatus("The previous duration does not extend this video. Choose a longer target.")
      return
    }

    setStatus(`Video duration read: ${formatDuration(duration)}.`)
  }

  function handleMetadataError() {
    setMetadata({ status: "error" })
    setTargetValue(null)
    setError("Brumaire could not read this video's duration. Choose another video.")
    setStatus("Video duration could not be read.")
  }

  const activeTargetOptions = TARGET_OPTIONS[targetMode]
  const sourceDuration = metadata.status === "ready" ? metadata.duration : null
  const planResult =
    sourceDuration !== null && targetValue !== null
      ? createExtensionPlan(sourceDuration, { mode: targetMode, value: targetValue })
      : null
  const plan = planResult?.ok ? planResult.plan : null

  function isTargetDisabled(value: number) {
    if (sourceDuration === null) {
      return true
    }

    return targetMode === "duration" && !isDurationTargetAvailable(sourceDuration, value)
  }

  const targetDescription = (() => {
    if (metadata.status === "loading") {
      return "Reading video duration…"
    }

    if (metadata.status === "error") {
      return "Choose another video so Brumaire can calculate an extension plan."
    }

    if (!plan) {
      return "Choose a target. Extension is not available yet."
    }

    if (plan.target.mode === "loops") {
      return `${plan.totalPlays} total plays · ${formatDuration(plan.outputDuration)} output. Extension is not available yet.`
    }

    const trimCopy =
      plan.finalPartialDuration === null
        ? "complete plays only"
        : `final play trimmed to ${formatDuration(plan.finalPartialDuration)}`

    return `${formatDuration(plan.outputDuration)} exact · ${plan.totalPlays} total plays · ${trimCopy}. Extension is not available yet.`
  })()

  return (
    <>
      <section aria-labelledby="selection-title" className="ios-group ios-selection-group">
        <input
          ref={inputRef}
          className="ios-visually-hidden"
          type="file"
          accept="video/*"
          onChange={handleSelection}
          tabIndex={-1}
        />

        {selectedFile ? (
          <>
            <div className="ios-video-preview">
              {previewUrl ? (
                // biome-ignore lint/a11y/useMediaCaption: User-selected local videos do not have an associated captions file.
                <video
                  key={previewUrl}
                  className="ios-video-element"
                  src={previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`Preview of ${selectedFile.name}`}
                  onLoadedMetadata={handleLoadedMetadata}
                  onError={handleMetadataError}
                />
              ) : (
                <p className="ios-selection-status">Preparing preview…</p>
              )}
            </div>

            <div className="ios-selected-file">
              <div className="ios-selected-file-copy">
                <h2 id="selection-title" className="ios-selection-title">
                  {selectedFile.name}
                </h2>
                <p className="ios-selection-status">
                  {formatFileSize(selectedFile.size)}
                  {metadata.status === "ready" ? ` · ${formatDuration(metadata.duration)}` : ""}
                  {" · Local file"}
                </p>
              </div>
              <div className="ios-selection-actions">
                <button type="button" className="ios-selection-action" onClick={openPicker}>
                  Choose another
                </button>
                <button
                  type="button"
                  className="ios-selection-action ios-selection-action-muted"
                  onClick={removeSelection}
                >
                  Remove
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="ios-selection-surface ios-selection-trigger"
            onClick={openPicker}
            aria-describedby="selection-helper"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 48 48"
              className="ios-selection-icon"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M8.5 13.5h31v23h-31z" />
              <path d="m20 19 9 6-9 6V19Z" />
            </svg>
            <h2 id="selection-title" className="ios-selection-title">
              Video selection
            </h2>
            <p id="selection-helper" className="ios-selection-status">
              Choose a video from this device.
            </p>
          </button>
        )}

        {error ? (
          <p className="ios-selection-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="ios-visually-hidden" aria-live="polite">
          {status}
        </p>
      </section>

      {selectedFile ? (
        <section className="ios-target" aria-labelledby="target-title">
          <h2 id="target-title" className="ios-section-heading">
            Target
          </h2>

          <fieldset className="ios-target-mode-group">
            <legend className="ios-visually-hidden">Target mode</legend>
            <div className="ios-target-segmented">
              {(["duration", "loops"] as const).map((mode) => (
                <label className="ios-target-segment" key={mode}>
                  <input
                    className="ios-visually-hidden"
                    type="radio"
                    name="target-mode"
                    value={mode}
                    checked={targetMode === mode}
                    onChange={() => changeTargetMode(mode)}
                  />
                  <span>{mode === "duration" ? "Duration" : "Loops"}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="ios-target-options-group">
            <legend className="ios-target-legend">
              {targetMode === "duration" ? "Target duration" : "Total loops"}
            </legend>
            <div className="ios-group">
              {activeTargetOptions.map((value) => {
                const disabled = isTargetDisabled(value)
                const unavailable =
                  metadata.status === "ready" && targetMode === "duration" && disabled

                return (
                  <label className="ios-target-option" key={`${targetMode}-${value}`}>
                    <input
                      className="ios-visually-hidden"
                      type="radio"
                      name="target-value"
                      value={value}
                      checked={targetValue === value}
                      disabled={disabled}
                      onChange={() => selectTarget(value)}
                    />
                    <span>
                      {targetMode === "duration" ? `${value} seconds` : `${value}× total plays`}
                    </span>
                    <span className="ios-target-option-trailing">
                      {unavailable ? (
                        <span className="ios-target-unavailable">Unavailable</span>
                      ) : (
                        <span className="ios-target-check" aria-hidden="true">
                          {targetValue === value ? "✓" : ""}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <p className="ios-target-note">{targetDescription}</p>
        </section>
      ) : null}
    </>
  )
}
