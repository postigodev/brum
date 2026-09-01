import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Brum" },
      {
        name: "description",
        content: "How Brum handles local video processing, files, and generated boomerangs.",
      },
    ],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <>
      <div className="privacy-local-nav">
        <div className="privacy-local-nav-inner">
          <Link className="privacy-local-title" to="/privacy">
            Privacy
          </Link>
          <nav aria-label="Privacy sections">
            <a href="#processing">Processing</a>
            <a href="#data">Data</a>
            <a href="#changes">Changes</a>
          </nav>
        </div>
      </div>

      <main className="privacy-main">
        <header className="policy-head">
          <h1>Brum Privacy Policy</h1>
          <p className="policy-updated">
            Updated <time dateTime="2026-08-31">August 31, 2026</time>
          </p>
          <p className="policy-intro">
            This policy describes how Brum handles information when you use the website and its
            boomerang creation tool.
          </p>
          <p className="policy-intro">
            Supported videos are processed in your browser. They do not need to be uploaded to Brum
            for the creation workflow.
          </p>
          <ul className="policy-jump-links">
            <li>
              <a href="#processing">How video processing works</a>
            </li>
            <li>
              <a href="#data">Information handled by Brum</a>
            </li>
            <li>
              <a href="#changes">Changes to this policy</a>
            </li>
          </ul>
        </header>

        <article className="policy">
          <section className="policy-section" id="processing">
            <h2>How Video Processing Works</h2>
            <p>
              When you choose a supported MP4, Brum makes the file available to browser APIs so it
              can inspect the video track, decode frames, and create forward-and-reverse motion.
            </p>
            <p>
              Processing and verification run locally on your device. The source file is unchanged,
              and the finished result is a new silent H.264 MP4.
            </p>
            <p>
              Exact-duration targets may trim the final emitted frame so the finished file still
              matches the duration you requested.
            </p>
          </section>

          <section className="policy-section" id="data">
            <h2>Information Handled by Brum</h2>
            <h3>Video files</h3>
            <p>
              Source videos and generated results are held by your browser for preview, processing,
              saving, or sharing. Brum does not intentionally upload them to a server.
            </p>
            <h3>Accounts</h3>
            <p>Brum has no account system and does not require personal profile information.</p>
            <h3>Media storage</h3>
            <p>
              Brum has no cloud media library. Temporary browser object URLs are released when they
              are replaced or when you leave the workflow.
            </p>
            <p className="policy-note">
              Inputs are limited to 50 MiB, generated outputs to 200 MiB, and decoded frame storage
              to a 256 MiB safety budget.
            </p>
          </section>

          <section className="policy-section">
            <h2>Your Files and Third Parties</h2>
            <p>
              Saving writes the result through your browser. Sharing opens the device share sheet
              only when the browser supports local file sharing and you choose that action.
            </p>
          </section>

          <section className="policy-section">
            <h2>Security and Local Processing</h2>
            <p>
              Local processing reduces the need to transfer media, but browser and device security
              still matter. Keep your browser updated and review the destination before sharing.
            </p>
          </section>

          <section className="policy-section" id="changes">
            <h2>Changes to This Privacy Policy</h2>
            <p>
              This page will be updated if Brum changes how it processes media or handles
              information. The date above identifies the current version.
            </p>
          </section>

          <section className="policy-section">
            <h2>Contact</h2>
            <p>
              Questions and reports can be opened in the{" "}
              <a href="https://github.com/postigodev/brumaire">Brum GitHub repository</a>.
            </p>
          </section>
        </article>
      </main>

      <footer className="privacy-footer">
        <div className="privacy-footer-main">
          <p>
            <Link to="/">Brum</Link> / Privacy
          </p>
          <div className="footer-row">
            <span>Local processing. No media library.</span>
            <span className="footer-spacer" />
            <Link to="/tool">Open Tool</Link>
          </div>
        </div>
      </footer>
    </>
  )
}
