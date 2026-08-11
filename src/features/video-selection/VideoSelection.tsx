import { useEffect, useRef, useState } from "react"

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ["KB", "MB", "GB"]
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1)
  const value = bytes / 1024 ** (unitIndex + 1)

  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`
}

export function VideoSelection() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("No video selected.")

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
      setError("Choose a video file to continue.")
      setStatus("The selected file is not a video.")
      event.currentTarget.value = ""
      return
    }

    setError(null)
    setSelectedFile(file)
    setStatus(`${file.name} selected. The file remains on this device.`)
  }

  function removeSelection() {
    setSelectedFile(null)
    setError(null)
    setStatus("Video removed.")

    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  return (
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
                className="ios-video-element"
                src={previewUrl}
                controls
                playsInline
                preload="metadata"
                aria-label={`Preview of ${selectedFile.name}`}
                onLoadedMetadata={() => setError(null)}
                onError={() =>
                  setError("This video cannot be previewed in this browser. Choose another video.")
                }
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
                {formatFileSize(selectedFile.size)} · Local file
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
  )
}
