import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/privacy")({ component: PrivacyPage })

function PrivacyPage() {
  return (
    <main className="ios-main">
      <article aria-labelledby="privacy-title">
        <p className="ios-eyebrow">Temporary notice</p>
        <h1 id="privacy-title" className="ios-page-title ios-privacy-title">
          Privacy
        </h1>
        <p className="ios-privacy-meta">
          Last updated <time dateTime="2026-08-11">August 11, 2026</time>
        </p>

        <div className="ios-group ios-privacy-group">
          <p className="ios-privacy-row">
            Brum is designed around local, on-device video processing. This application
            foundation does not process videos yet.
          </p>
          <p className="ios-privacy-row">
            Brum has no account system and does not intentionally upload video files
            to a server.
          </p>
          <p className="ios-privacy-row ios-privacy-row-muted">
            This temporary notice will be updated before video processing becomes available.
          </p>
        </div>
      </article>
    </main>
  )
}
