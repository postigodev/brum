import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Brum — Create boomerangs locally" },
      {
        name: "description",
        content:
          "Brum creates forward/reverse boomerang videos locally on your device.",
      },
      { name: "theme-color", content: "#f2f2f7" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="ios-header">
          <div className="ios-header-inner">
            <Link to="/" className="ios-wordmark" aria-label="Brum home">
              Brum
            </Link>
            <nav aria-label="Primary navigation" className="ios-nav">
              <Link to="/tool" className="ios-nav-link" activeProps={{ "aria-current": "page" }}>
                Tool
              </Link>
              <Link to="/privacy" className="ios-nav-link" activeProps={{ "aria-current": "page" }}>
                Privacy
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
