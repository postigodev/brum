import { createFileRoute, notFound } from "@tanstack/react-router"

import { RemuxSpike } from "#/features/video-processing/RemuxSpike"

export const Route = createFileRoute("/__spike/remux")({
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  head: () => ({ meta: [{ title: "Local remux spike — Brumaire" }] }),
  component: RemuxSpike,
})
