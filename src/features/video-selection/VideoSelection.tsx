import { useEffect, useRef, useState } from "react"

import {
  type BoomerangResult,
  createBoomerangVideo,
  RemuxError,
  readVideoTrackDuration,
} from "#/features/video-processing"

import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
  type TargetMode,
} from "./extension-plan"
import { outputFilename, processingErrorMessage } from "./processing-ui"

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
  const abortRef = useRef<AbortController | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<BoomerangResult | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("No video selected.")
  const [processing, setProcessing] = useState(false)
  const [shareAvailable, setShareAvailable] = useState(false)
  const [targetMode, setTargetMode] = useState<TargetMode>("duration")
  const [targetValue, setTargetValue] = useState<number | null>(null)
  const [metadata, setMetadata] = useState<MetadataState>({ status: "loading" })
  const targetModeRef = useRef(targetMode)
  const targetValueRef = useRef(targetValue)
  targetModeRef.current = targetMode
  targetValueRef.current = targetValue

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  useEffect(() => {
    if (!selectedFile) return

    const controller = new AbortController()
    void readVideoTrackDuration(selectedFile, controller.signal)
      .then((duration) => {
        setMetadata({ status: "ready", duration })
        setError(null)

        const currentTarget = targetValueRef.current
        if (
          targetModeRef.current === "duration" &&
          currentTarget !== null &&
          !isDurationTargetAvailable(duration, currentTarget)
        ) {
          setTargetValue(null)
          setStatus("The previous duration does not extend this video. Choose a longer target.")
          return
        }

        setStatus(`Video duration read: ${formatDuration(duration)}.`)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setMetadata({ status: "error" })
        setTargetValue(null)
        setError(
          caught instanceof RemuxError
            ? processingErrorMessage(caught.code)
            : "Brumaire could not read this video's visual duration. Choose another video.",
        )
        setStatus("Video track duration could not be read.")
      })

    return () => controller.abort()
  }, [selectedFile])

  useEffect(() => {
    if (!result) {
      setResultUrl(null)
      return
    }

    const objectUrl = URL.createObjectURL(result.blob)
    setResultUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [result])

  useEffect(() => {
    setShareAvailable(typeof navigator.share === "function")
    return () => abortRef.current?.abort()
  }, [])

  function resetProcessing() {
    abortRef.current?.abort()
    abortRef.current = null
    setProcessing(false)
    setResult(null)
  }

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

    resetProcessing()

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
    resetProcessing()
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
    resetProcessing()
    setTargetMode(mode)
    setTargetValue(null)
    setStatus(`${mode === "duration" ? "Duration" : "Loops"} mode selected. Choose a target.`)
  }

  function selectTarget(value: number) {
    resetProcessing()
    setTargetValue(value)
    setStatus(
      targetMode === "duration"
        ? `Target set to ${value} seconds. Boomerang creation has not started.`
        : `Target set to ${value} boomerang cycles. Boomerang creation has not started.`,
    )
  }

  function handlePreviewError() {
    setError("Brumaire could not preview this video, but local processing may still be available.")
    setStatus("Video preview could not be loaded.")
  }

  const activeTargetOptions = TARGET_OPTIONS[targetMode]
  const sourceDuration = metadata.status === "ready" ? metadata.duration : null
  const planResult =
    sourceDuration !== null && targetValue !== null
      ? createExtensionPlan(sourceDuration, { mode: targetMode, value: targetValue })
      : null
  const plan = planResult?.ok ? planResult.plan : null
  const resultFilename =
    selectedFile && plan ? outputFilename(selectedFile.name, plan.target) : null

  async function createBoomerang() {
    if (!selectedFile || !plan || processing) return

    const controller = new AbortController()
    abortRef.current = controller
    setProcessing(true)
    setResult(null)
    setError(null)
    setStatus("Building the boomerang locally on this device.")

    try {
      const nextResult = await createBoomerangVideo(selectedFile, plan, {
        signal: controller.signal,
      })
      if (abortRef.current !== controller) return
      setResult(nextResult)
      setStatus(`Video ready. ${formatDuration(nextResult.duration)} created locally.`)
    } catch (caught) {
      if (abortRef.current !== controller) return
      if (caught instanceof RemuxError) {
        if (caught.code === "canceled") {
          setStatus("Boomerang creation canceled. The original video is unchanged.")
        } else {
          setError(processingErrorMessage(caught.code))
          setStatus(`Boomerang creation failed: ${caught.code}.`)
        }
      } else {
        setError("Brumaire could not create this boomerang. Try another MP4.")
        setStatus("Boomerang creation failed.")
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setProcessing(false)
      }
    }
  }

  function cancelProcessing() {
    abortRef.current?.abort()
    setStatus("Canceling boomerang creation…")
  }

  async function shareResult() {
    if (!result || !resultFilename || !navigator.share) return

    const outputFile = new File([result.blob], resultFilename, { type: "video/mp4" })
    const shareData: ShareData = { files: [outputFile], title: "Brumaire video" }
    if (navigator.canShare && !navigator.canShare(shareData)) {
      setError("This browser cannot share the finished file. Save it instead.")
      return
    }

    try {
      await navigator.share(shareData)
      setStatus("Share sheet opened for the finished video.")
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return
      setError("The finished video could not be shared. Save it instead.")
    }
  }

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
      return "Choose a target to prepare the extension."
    }

    if (plan.target.mode === "loops") {
      return `${plan.totalCycles} boomerang cycles · ${formatDuration(plan.outputDuration)} output.`
    }

    const completeCycleCopy = `${plan.completeCycles} complete ${plan.completeCycles === 1 ? "cycle" : "cycles"}`
    const trimCopy =
      plan.finalPartialCycleDuration === null
        ? `${completeCycleCopy} only`
        : `${completeCycleCopy} · final cycle trimmed to ${formatDuration(plan.finalPartialCycleDuration)}`

    return `${formatDuration(plan.outputDuration)} exact · ${trimCopy}.`
  })()

  return (
    <>
      <section aria-labelledby="selection-title" className="ios-group ios-selection-group">
        <input
          ref={inputRef}
          className="ios-visually-hidden"
          type="file"
          accept="video/mp4,.mp4"
          onChange={handleSelection}
          tabIndex={-1}
        />

        {selectedFile ? (
          <>
            <div className="ios-video-preview">
              {resultUrl || previewUrl ? (
                // biome-ignore lint/a11y/useMediaCaption: User-selected local videos do not have an associated captions file.
                <video
                  key={resultUrl ?? previewUrl}
                  className="ios-video-element"
                  src={resultUrl ?? previewUrl ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={
                    result
                      ? `Preview of finished ${resultFilename}`
                      : `Preview of ${selectedFile.name}`
                  }
                  onError={result ? undefined : handlePreviewError}
                />
              ) : (
                <p className="ios-selection-status">Preparing preview…</p>
              )}
            </div>

            <div className="ios-selected-file">
              <div className="ios-selected-file-copy">
                <h2 id="selection-title" className="ios-selection-title">
                  {result ? resultFilename : selectedFile.name}
                </h2>
                <p className="ios-selection-status">
                  {result ? formatFileSize(result.byteSize) : formatFileSize(selectedFile.size)}
                  {result
                    ? ` · ${formatDuration(result.duration)} · Ready`
                    : metadata.status === "ready"
                      ? ` · ${formatDuration(metadata.duration)} · Local file`
                      : " · Local file"}
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
                    disabled={processing}
                    onChange={() => changeTargetMode(mode)}
                  />
                  <span>{mode === "duration" ? "Duration" : "Loops"}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="ios-target-options-group">
            <legend className="ios-target-legend">
              {targetMode === "duration" ? "Target duration" : "Boomerang cycles"}
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
                      disabled={disabled || processing}
                      onChange={() => selectTarget(value)}
                    />
                    <span>
                      {targetMode === "duration"
                        ? `${value} seconds`
                        : `${value}× boomerang cycles`}
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

          {plan ? (
            <section className="ios-processing" aria-labelledby="processing-title">
              <div className="ios-group ios-processing-panel" aria-busy={processing}>
                <div>
                  <h2 id="processing-title" className="ios-processing-title">
                    {result
                      ? "Video ready"
                      : processing
                        ? "Building boomerang locally…"
                        : "Ready to create"}
                  </h2>
                  <p className="ios-processing-copy">
                    {result
                      ? "The finished MP4 is ready to preview, save, or share."
                      : processing
                        ? "Keep Brumaire open while it builds and verifies the new file."
                        : "Processing stays in this browser. Your video is not uploaded."}
                  </p>
                </div>

                {result && resultUrl && resultFilename ? (
                  <div className="ios-processing-actions">
                    <a className="ios-primary-action" href={resultUrl} download={resultFilename}>
                      Save video
                    </a>
                    {shareAvailable ? (
                      <button
                        type="button"
                        className="ios-secondary-action"
                        onClick={() => void shareResult()}
                      >
                        Share video
                      </button>
                    ) : null}
                  </div>
                ) : processing ? (
                  <button type="button" className="ios-secondary-action" onClick={cancelProcessing}>
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ios-primary-action"
                    onClick={() => void createBoomerang()}
                  >
                    Create boomerang
                  </button>
                )}
              </div>
            </section>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
