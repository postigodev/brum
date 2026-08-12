import { useEffect, useMemo, useRef, useState } from "react"

import {
  createExtensionPlan,
  DURATION_TARGETS,
  isDurationTargetAvailable,
  LOOP_TARGETS,
  type TargetMode,
} from "#/features/video-selection/extension-plan"

import { inspectMedia, type MediaInspection, RemuxError, type RemuxResult, remuxVideo } from "."

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(3)} s`
}

function audioStrategy(inspection: MediaInspection) {
  const timeline = inspection.audio?.timeline
  if (!timeline) return "No audio"
  if (timeline.kind === "packet-copy") return "Audio will be copied"
  if (timeline.kind === "reencode") return "Audio will be re-encoded"
  return timeline.reason
}

export function RemuxSpike() {
  const [file, setFile] = useState<File | null>(null)
  const [inspection, setInspection] = useState<MediaInspection | null>(null)
  const [mode, setMode] = useState<TargetMode>("duration")
  const [target, setTarget] = useState<number>(15)
  const [result, setResult] = useState<RemuxResult | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const outputUrl = useMemo(() => (result ? URL.createObjectURL(result.blob) : null), [result])

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl)
    }
  }, [outputUrl])

  useEffect(() => () => abortRef.current?.abort(), [])

  async function selectFile(selected: File | null) {
    abortRef.current?.abort()
    setFile(selected)
    setInspection(null)
    setResult(null)
    setElapsedMs(null)
    setError(null)
    if (!selected) return

    try {
      setInspection(await inspectMedia(selected))
    } catch (caught) {
      setError(caught instanceof RemuxError ? caught.code : "remux-failed")
    }
  }

  function chooseMode(nextMode: TargetMode) {
    setMode(nextMode)
    setTarget(nextMode === "duration" ? 15 : 2)
    setResult(null)
  }

  async function run() {
    if (!file || !inspection || running) return
    const planResult = createExtensionPlan(inspection.duration, { mode, value: target })
    if (!planResult.ok) {
      setError(planResult.reason)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setResult(null)
    setError(null)
    const startedAt = performance.now()
    try {
      setResult(await remuxVideo(file, planResult.plan, { signal: controller.signal }))
    } catch (caught) {
      setError(caught instanceof RemuxError ? caught.code : "remux-failed")
    } finally {
      setElapsedMs(performance.now() - startedAt)
      setRunning(false)
      abortRef.current = null
    }
  }

  const targets = mode === "duration" ? DURATION_TARGETS : LOOP_TARGETS
  const unsupportedAudio = inspection?.audio?.timeline.kind === "unsupported"

  return (
    <main className="ios-main spike-main">
      <header>
        <p className="ios-eyebrow">Internal development route</p>
        <h1 className="ios-page-title ios-tool-title">Local remux spike</h1>
        <p className="ios-body-copy spike-intro">
          Packet-copy feasibility harness. No media leaves this browser. Physical iPhone validation
          is still pending.
        </p>
      </header>

      <section className="ios-group spike-panel" aria-labelledby="spike-input-title">
        <h2 id="spike-input-title" className="spike-heading">
          Source MP4
        </h2>
        <input
          type="file"
          accept="video/mp4,.mp4"
          onChange={(event) => void selectFile(event.currentTarget.files?.[0] ?? null)}
        />
        {file && (
          <p className="spike-detail">
            {file.name} · {formatBytes(file.size)}
          </p>
        )}
        {inspection && (
          <dl className="spike-facts">
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(inspection.duration)}</dd>
            </div>
            <div>
              <dt>Video</dt>
              <dd>
                {inspection.video.codecString} · {inspection.video.codedWidth}×
                {inspection.video.codedHeight}
              </dd>
            </div>
            <div>
              <dt>Audio</dt>
              <dd>
                {inspection.audio
                  ? `${inspection.audio.codecString} · ${inspection.audio.sampleRate} Hz`
                  : "None"}
              </dd>
            </div>
            <div>
              <dt>Strategy</dt>
              <dd>{audioStrategy(inspection)}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="ios-group spike-panel" aria-labelledby="spike-target-title">
        <h2 id="spike-target-title" className="spike-heading">
          Target
        </h2>
        <div className="spike-segments">
          {(["duration", "loops"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? "is-selected" : ""}
              onClick={() => chooseMode(value)}
            >
              {value === "duration" ? "Duration" : "Loops"}
            </button>
          ))}
        </div>
        <div className="spike-targets">
          {targets.map((value) => {
            const unavailable =
              mode === "duration" && inspection
                ? !isDurationTargetAvailable(inspection.duration, value)
                : false
            return (
              <button
                key={value}
                type="button"
                disabled={unavailable}
                className={target === value ? "is-selected" : ""}
                onClick={() => setTarget(value)}
              >
                {mode === "duration" ? `${value}s` : `${value}×`}
              </button>
            )
          })}
        </div>
        <div className="spike-actions">
          <button
            type="button"
            className="spike-run"
            disabled={!inspection || unsupportedAudio || running}
            onClick={() => void run()}
          >
            {running ? "Running…" : "Run remux"}
          </button>
          {running && (
            <button
              type="button"
              className="spike-cancel"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      {error && (
        <p className="ios-selection-error" role="alert">
          Error: <code>{error}</code>
        </p>
      )}

      {result && outputUrl && (
        <section className="ios-group spike-panel" aria-labelledby="spike-output-title">
          <h2 id="spike-output-title" className="spike-heading">
            Verified output
          </h2>
          {/* biome-ignore lint/a11y/useMediaCaption: arbitrary local test media has no caption source */}
          <video className="spike-video" src={outputUrl} controls playsInline />
          <p className="spike-detail">
            {formatDuration(result.duration)} · {formatBytes(result.byteSize)}
            {elapsedMs === null ? "" : ` · ${(elapsedMs / 1000).toFixed(2)} s elapsed`}
          </p>
          <p className="spike-detail">
            Audio: {result.audioMode}
            {result.audioBitrate === null
              ? ""
              : ` · ${Math.round(result.audioBitrate / 1000)} kbps`}
          </p>
          <pre className="spike-report">{JSON.stringify(result.verification, null, 2)}</pre>
          <a
            className="ios-primary-action"
            href={outputUrl}
            download={`brumaire-${target}${mode === "duration" ? "s" : "x"}.mp4`}
          >
            Download MP4
          </a>
        </section>
      )}
    </main>
  )
}
