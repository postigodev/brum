import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Brum — Make a moment last longer" },
      {
        name: "description",
        content: "Create a forward-and-reverse boomerang locally, then save or share the MP4.",
      },
    ],
  }),
  component: HomePage,
})

function HomePage() {
  return (
    <>
      <main>
        <section className="home-hero" id="overview" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="home-eyebrow">Brum</p>
            <h1 id="home-title">Make a moment last longer.</h1>
            <p className="home-intro">
              Turn a short video into a forward-and-reverse boomerang. Right on your device.
            </p>
            <div className="home-actions">
              <Link className="button-primary" to="/tool">
                Open the tool
              </Link>
              <a className="text-link" href="#local">
                How it works
              </a>
            </div>
          </div>
        </section>

        <section className="product-section" aria-label="Brum boomerang preview">
          <div className="product-stage">
            <div className="stage-copy">
              <p>A short clip in. A complete boomerang out.</p>
            </div>
            <div className="stage-timeline" aria-hidden="true">
              <span>3.2 s</span>
              <span>→</span>
              <strong>15 s</strong>
            </div>
            <div className="media-stack">
              <div className="media-shadow" aria-hidden="true" />
              <div className="media-shadow media-shadow-second" aria-hidden="true" />
              <div className="media-frame">
                <div className="video-fallback" aria-hidden="true">
                  <small>Example boomerang</small>
                  <strong>3.2 seconds</strong>
                </div>
                <video
                  className="home-demo-video"
                  src="/media/brum-loop.mp4"
                  poster="/media/brum-loop-poster.webp"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label="Abstract motion playing forward and then backward"
                />
              </div>
            </div>
            <p className="media-caption">The original stays untouched. Brum creates a new MP4.</p>
          </div>
        </section>

        <section className="editorial" id="local" aria-labelledby="local-title">
          <div className="editorial-inner">
            <div className="editorial-grid">
              <div>
                <p className="section-kicker">Local by design</p>
                <h2 id="local-title">The file stays where you put it.</h2>
              </div>
              <div className="editorial-copy">
                <p>
                  Brum processes supported videos <strong>inside your browser</strong>. There is no
                  upload step before boomerang creation begins.
                </p>
                <p>
                  Choose an exact duration or cycle count, then save or share the finished silent
                  MP4.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="dark-section" aria-labelledby="focused-title">
          <div className="dark-panel">
            <div>
              <p className="section-kicker">Nothing extra</p>
              <h2 id="focused-title">No account. No cloud library. Just the video.</h2>
            </div>
            <div className="dark-detail">
              <div className="dark-rule" aria-hidden="true" />
              <p>
                Brum is a focused utility: <strong>select, create, save.</strong> The interface
                stays out of the way because the file is the point.
              </p>
            </div>
          </div>
        </section>

        <section className="final-cta" aria-labelledby="home-cta-title">
          <div className="final-cta-inner">
            <h2 id="home-cta-title">Give the moment another pass.</h2>
            <p>Choose a short MP4, pick a target, and create it locally.</p>
            <Link className="button-primary" to="/tool">
              Open Brum
            </Link>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p className="footer-note">
            Brum processes supported media locally in the browser. Format and browser support may
            vary.
          </p>
          <div className="footer-row">
            <span>Brum</span>
            <nav className="footer-links" aria-label="Footer navigation">
              <Link to="/tool">Tool</Link>
              <Link to="/privacy">Privacy</Link>
            </nav>
          </div>
        </div>
      </footer>
    </>
  )
}
