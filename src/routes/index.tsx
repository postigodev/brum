import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage() {
  return (
    <main className="ios-main">
      <section aria-labelledby="home-title">
        <p className="ios-eyebrow">Short loop, longer story</p>
        <h1 id="home-title" className="ios-page-title ios-home-title">
          Brum
        </h1>
        <p className="ios-body-copy ios-home-copy">
          A focused tool in development for extending short videos and Boomerangs to the length your
          story needs.
        </p>

        <div className="ios-home-action max-w-[390px]">
          <Link to="/tool" className="ios-primary-action">
            Open the tool
            <span aria-hidden="true" className="ml-3">
              →
            </span>
          </Link>
          <p className="ios-inline-status">The processing flow is not available yet.</p>
        </div>
      </section>

      <aside className="ios-group ios-local-note max-w-[390px]" aria-label="Privacy note">
        <div>
          <p className="ios-local-note-title">Designed to stay local</p>
          <p className="ios-local-note-copy">
            Brum processes video on your device, without sending the file to a
            server.
          </p>
        </div>
      </aside>
    </main>
  )
}
