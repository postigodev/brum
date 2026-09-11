import { defineConfig } from "vitest/config"
import browserConfig from "./vitest.browser.config.ts"

export default defineConfig({
  ...browserConfig,
  test: { ...browserConfig.test, include: ["scripts/video-benchmark.ts"], testTimeout: 180_000 },
})
