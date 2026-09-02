import { useEffect, useRef, useState } from "react"

import {
  type BoomerangResult,
  createBoomerangVideo,
  ProcessingError,
  readVideoTrackDuration,
} from "#/features/video-processing"

import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
  type SpeedPreset,
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

const SPEED_OPTIONS = [
  { value: "boomerang", label: "Boomerang" },
  { value: "slowMo", label: "Slow Motion" },
  { value: "original", label: "Original" },
] as const satisfies readonly { value: SpeedPreset; label: string }[]

function speedLabel(speed: SpeedPreset) {
  return SPEED_OPTIONS.find((option) => option.value === speed)?.label ?? speed
}

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
  const [speed, setSpeed] = useState<SpeedPreset>("boomerang")
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
          caught instanceof ProcessingError
            ? processingErrorMessage(caught.code)
            : "Brum could not read this video's visual duration. Choose another video.",
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
    setSpeed("boomerang")
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

  function changeSpeed(nextSpeed: SpeedPreset) {
    resetProcessing()
    setSpeed(nextSpeed)
    setStatus(`${speedLabel(nextSpeed)} speed selected. Boomerang creation has not started.`)
  }

  function handlePreviewError() {
    setError("Brum could not preview this video, but local processing may still be available.")
    setStatus("Video preview could not be loaded.")
  }

  const activeTargetOptions = TARGET_OPTIONS[targetMode]
  const sourceDuration = metadata.status === "ready" ? metadata.duration : null
  const planResult =
    sourceDuration !== null && targetValue !== null
      ? createExtensionPlan(sourceDuration, { mode: targetMode, value: targetValue }, speed)
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
      if (caught instanceof ProcessingError) {
        if (caught.code === "canceled") {
          setStatus("Boomerang creation canceled. The original video is unchanged.")
        } else {
          setError(processingErrorMessage(caught.code))
          setStatus(`Boomerang creation failed: ${caught.code}.`)
        }
      } else {
        setError("Brum could not create this boomerang. Try another MP4.")
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
    const shareData: ShareData = { files: [outputFile], title: "Brum video" }
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
      return "Choose another video so Brum can calculate a boomerang plan."
    }

    if (!plan) {
      return "Choose a target to prepare the boomerang."
    }

    if (plan.target.mode === "loops") {
      const cycleCopy = `${plan.totalCycles} complete ${plan.totalCycles === 1 ? "cycle" : "cycles"}`
      return `${cycleCopy} · ${formatDuration(plan.outputDuration)} · ${speedLabel(plan.speed)}.`
    }

    const completeCycleCopy = `${plan.completeCycles} complete ${plan.completeCycles === 1 ? "cycle" : "cycles"}`
    const trimCopy =
      plan.finalPartialCycleDuration === null
        ? `${completeCycleCopy} only`
        : `${completeCycleCopy} · final cycle trimmed to ${formatDuration(plan.finalPartialCycleDuration)}`

    return `${formatDuration(plan.outputDuration)} exact · ${trimCopy} · ${speedLabel(plan.speed)}.`
  })()

  return (
    <div className="tool-configurator">
      <section className="tool-preview-column" aria-labelledby="selection-title">
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="video/mp4,.mp4"
          onChange={handleSelection}
          tabIndex={-1}
        />

        <div className="tool-preview" aria-busy={processing}>
          {selectedFile ? (
            resultUrl || previewUrl ? (
              // biome-ignore lint/a11y/useMediaCaption: User-selected local videos do not have an associated captions file.
              <video
                key={resultUrl ?? previewUrl}
                className="tool-video-element"
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
              <p className="tool-preview-status">Preparing preview…</p>
            )
          ) : (
            <button
              type="button"
              className="tool-empty-state"
              onClick={openPicker}
              aria-describedby="selection-helper"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="tool-empty-icon"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 4v11m0-11 4 4m-4-4-4 4M6 13v5.25A1.75 1.75 0 0 0 7.75 20h8.5A1.75 1.75 0 0 0 18 18.25V13" />
              </svg>
              <h2 id="selection-title">No video selected</h2>
              <p id="selection-helper">Choose a supported MP4 from this device.</p>
            </button>
          )}

          {processing ? (
            <div className="tool-processing-overlay">
              <span className="tool-spinner" aria-hidden="true" />
              <strong>Creating boomerang…</strong>
              <span>Keep this page open while Brum builds and verifies the file.</span>
            </div>
          ) : null}

          {result ? <span className="tool-ready-badge">Ready</span> : null}
        </div>

        {error ? (
          <p className="tool-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="visually-hidden" aria-live="polite">
          {status}
        </p>
      </section>

      <aside className="tool-options" aria-label="Video settings">
        <section className="tool-options-section">
          <h2>Video</h2>
          <p>Choose the source file for your boomerang.</p>

          {selectedFile ? (
            <div className="tool-file-meta">
              <span className="tool-file-icon">MP4</span>
              <div className="tool-file-copy">
                <strong>{result ? resultFilename : selectedFile.name}</strong>
                <span>
                  {result ? formatFileSize(result.byteSize) : formatFileSize(selectedFile.size)}
                  {result
                    ? ` · ${formatDuration(result.duration)} · Ready`
                    : metadata.status === "ready"
                      ? ` · ${formatDuration(metadata.duration)} · Local`
                      : " · Reading…"}
                </span>
              </div>
              <button type="button" className="tool-inline-action" onClick={openPicker}>
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button-primary tool-choose-button"
              onClick={openPicker}
            >
              Choose Video
            </button>
          )}
        </section>

        <section className="tool-options-section" aria-labelledby="target-title">
          <h2 id="target-title">Output</h2>
          <p>Choose an exact duration or number of complete cycles.</p>

          {selectedFile ? (
            <>
              <fieldset className="tool-fieldset">
                <legend>Measure by</legend>
                <div className="tool-segmented">
                  {(["duration", "loops"] as const).map((mode) => (
                    <label className="tool-segment" key={mode}>
                      <input
                        className="visually-hidden"
                        type="radio"
                        name="target-mode"
                        value={mode}
                        checked={targetMode === mode}
                        disabled={processing}
                        onChange={() => changeTargetMode(mode)}
                      />
                      <span>{mode === "duration" ? "Duration" : "Cycles"}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="tool-fieldset">
                <legend>Speed</legend>
                <div className="tool-segmented tool-speed-options">
                  {SPEED_OPTIONS.map((option) => (
                    <label className="tool-segment" key={option.value}>
                      <input
                        className="visually-hidden"
                        type="radio"
                        name="speed"
                        value={option.value}
                        checked={speed === option.value}
                        disabled={processing}
                        onChange={() => changeSpeed(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="tool-fieldset">
                <legend>{targetMode === "duration" ? "Length" : "Boomerang cycles"}</legend>
                <div className="tool-targets">
                  {activeTargetOptions.map((value) => {
                    const disabled = isTargetDisabled(value)
                    const unavailable =
                      metadata.status === "ready" && targetMode === "duration" && disabled

                    return (
                      <label className="tool-target" key={`${targetMode}-${value}`}>
                        <input
                          className="visually-hidden"
                          type="radio"
                          name="target-value"
                          value={value}
                          checked={targetValue === value}
                          disabled={disabled || processing}
                          onChange={() => selectTarget(value)}
                        />
                        <span>
                          {targetMode === "duration" ? `${value} seconds` : `${value} cycles`}
                        </span>
                        {unavailable ? <small>Unavailable</small> : null}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <div className="tool-output-summary">
                <span>Output plan</span>
                <strong>{targetDescription}</strong>
              </div>

              <div className="tool-actions" aria-busy={processing}>
                {result && resultUrl && resultFilename ? (
                  <>
                    <a className="button-primary" href={resultUrl} download={resultFilename}>
                      Save video
                    </a>
                    {shareAvailable ? (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => void shareResult()}
                      >
                        Share video
                      </button>
                    ) : null}
                    <button type="button" className="button-secondary" onClick={removeSelection}>
                      Start over
                    </button>
                  </>
                ) : processing ? (
                  <button type="button" className="button-secondary" onClick={cancelProcessing}>
                    Cancel
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="button-primary"
                      disabled={!plan}
                      onClick={() => void createBoomerang()}
                    >
                      Create boomerang
                    </button>
                    <button type="button" className="button-secondary" onClick={removeSelection}>
                      Reset
                    </button>
                  </>
                )}
              </div>
            </>
          ) : null}
        </section>

        <p className="tool-privacy-note">
          Processing happens in this browser. Source videos are not uploaded, and generated MP4s are
          silent.
        </p>
      </aside>
    </div>
  )
}
