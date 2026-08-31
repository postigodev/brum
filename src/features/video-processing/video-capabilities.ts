import { canEncodeVideo, type InputVideoTrack, Quality, type VideoEncodingConfig } from "mediabunny"

import { RemuxError } from "./errors"

export type AvcEncodingConfig = VideoEncodingConfig & { codec: "avc" }

export function createAvcEncodingConfig(bitrate: number): AvcEncodingConfig {
  return { codec: "avc", quality: new Quality({ bitrate }) }
}

export async function assertVideoDecoderAvailable(track: Pick<InputVideoTrack, "canDecode">) {
  if (!(await track.canDecode())) {
    throw new RemuxError(
      "video-decoder-unavailable",
      "This browser cannot decode the selected H.264 video.",
    )
  }
}

export async function assertAvcEncoderAvailable(
  config: AvcEncodingConfig,
  width: number,
  height: number,
) {
  const { codec, quality, ...options } = config
  if (!(await canEncodeVideo(codec, { ...options, width, height, quality }))) {
    throw new RemuxError(
      "video-encoder-unavailable",
      "This browser cannot encode the requested H.264 output.",
    )
  }
}
