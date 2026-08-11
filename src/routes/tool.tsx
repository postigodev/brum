import { createFileRoute } from "@tanstack/react-router"

import { VideoSelection } from "#/features/video-selection/VideoSelection"

export const Route = createFileRoute("/tool")({ component: ToolPage })

function ToolPage() {
  return (
    <main className="ios-main">
      <section aria-labelledby="tool-title">
        <h1 id="tool-title" className="ios-page-title ios-tool-title">
          Start with a short loop.
        </h1>
        <p className="ios-body-copy">
          Choose a short video from this device. Processing and export have not been implemented
          yet.
        </p>
      </section>

      <VideoSelection />

      <section aria-labelledby="flow-title" className="ios-flow">
        <h2 id="flow-title" className="ios-section-heading">
          Planned flow
        </h2>
        <div className="ios-group">
          <div className="ios-group-row">Select</div>
          <div className="ios-group-row">Choose a target</div>
          <div className="ios-group-row">Extend locally</div>
          <div className="ios-group-row">Save or share</div>
        </div>
      </section>

      <aside className="ios-group ios-local-note" aria-label="Local processing note">
        <div>
          <p className="ios-local-note-title">Designed to stay local</p>
          <p className="ios-local-note-copy">
            Brumaire is intended to process video on your device, without sending the file to a
            server.
          </p>
        </div>
      </aside>
    </main>
  )
}
