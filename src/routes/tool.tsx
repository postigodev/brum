import { createFileRoute, Link } from "@tanstack/react-router"

import { VideoSelection } from "#/features/video-selection/VideoSelection"

export const Route = createFileRoute("/tool")({
  head: () => ({
    meta: [
      { title: "Create a boomerang — Brum" },
      {
        name: "description",
        content: "Choose a short MP4 and create a silent forward-and-reverse boomerang locally.",
      },
    ],
  }),
  component: ToolPage,
})

function ToolPage() {
  return (
    <>
      <main className="tool-page">
        <header className="tool-page-head">
          <h1>Create a boomerang</h1>
          <p>Select a short video and choose an exact output target.</p>
        </header>
        <VideoSelection />
      </main>

      <footer className="tool-footer">
        <div className="tool-footer-inner">
          <span>Brum</span>
          <span className="footer-spacer" />
          <Link to="/privacy">Privacy</Link>
        </div>
      </footer>
    </>
  )
}
