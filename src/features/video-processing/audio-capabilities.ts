import { canDecodeAudio, canEncodeAudio } from "mediabunny"

import { RemuxError } from "./errors"

let encoderRegistration: Promise<void> | null = null

export async function assertAacDecoder(config: AudioDecoderConfig) {
  if (!(await canDecodeAudio("aac", config))) {
    throw new RemuxError(
      "audio-decoder-unavailable",
      "This browser cannot decode AAC for the audio-only fallback.",
    )
  }
}

export async function ensureAacEncoder(
  sampleRate: number,
  numberOfChannels: number,
  bitrate: number,
) {
  const options = { sampleRate, numberOfChannels, bitrate }
  if (await canEncodeAudio("aac", options)) return

  encoderRegistration ??= import("@mediabunny/aac-encoder").then(({ registerAacEncoder }) => {
    registerAacEncoder()
  })
  await encoderRegistration

  if (!(await canEncodeAudio("aac", options))) {
    throw new RemuxError(
      "audio-encoder-unavailable",
      "This browser cannot encode AAC for the audio-only fallback.",
    )
  }
}
