import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router"
import { type ReactNode, useEffect, useState } from "react"

import appCss from "../styles.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Brum — Create boomerangs locally" },
      {
        name: "description",
        content: "Brum creates forward-and-reverse boomerang videos locally in your browser.",
      },
      { name: "theme-color", content: "#ffffff" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <SiteNavigation />
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function SiteNavigation() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function closeForDesktop() {
      if (window.innerWidth > 833) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("resize", closeForDesktop)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("resize", closeForDesktop)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [])

  useEffect(() => {
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = open ? "hidden" : previousOverflow
    return () => {
      document.documentElement.style.overflow = previousOverflow
    }
  }, [open])

  function closeNavigation() {
    setOpen(false)
  }

  return (
    <header className="global-nav" data-open={open}>
      <div className="global-nav-inner">
        <Link to="/" className="brand" aria-label="Brum home" onClick={closeNavigation}>
          Brum
        </Link>

        <button
          className="mobile-menu-button"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-controls="primary-navigation"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span />
          <span />
        </button>

        <nav id="primary-navigation" className="global-nav-links" aria-label="Primary navigation">
          <Link
            to="/"
            className="global-nav-link"
            activeOptions={{ exact: true }}
            activeProps={{ "aria-current": "page" }}
            onClick={closeNavigation}
          >
            Overview
          </Link>
          <Link
            to="/privacy"
            className="global-nav-link"
            activeProps={{ "aria-current": "page" }}
            onClick={closeNavigation}
          >
            Privacy
          </Link>
          <Link
            to="/tool"
            className="global-nav-cta"
            activeProps={{ "aria-current": "page" }}
            onClick={closeNavigation}
          >
            Open Tool
          </Link>
        </nav>
      </div>
    </header>
  )
}
