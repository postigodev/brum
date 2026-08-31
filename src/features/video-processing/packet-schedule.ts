import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { RemuxError, throwIfAborted } from "./errors"
import type { PacketLedgerEntry, PacketRecord, TrackKind } from "./types"

export const TIMELINE_TOLERANCE_SECONDS = 0.001
export const METADATA_DURATION_TOLERANCE_SECONDS = 0.05

// Temporary compatibility for the forward-only remux. This maps the boomerang plan
// to enough source passes to reach its duration; it does not produce reverse motion.
// Production uses decoded forward/reverse processing; this remains only for the legacy remux spike
// until its broader cleanup in issue #6.
export function legacyForwardRepetitionCount(plan: ExtensionPlan) {
  const partialCycleRepetitions =
    plan.finalPartialCycleDuration === null
      ? 0
      : plan.finalPartialCycleDuration <= plan.sourceDuration
        ? 1
        : 2

  return plan.completeCycles * 2 + partialCycleRepetitions
}

export function assertPlanMatchesSource(plan: ExtensionPlan, inspectedDuration: number) {
  if (!Number.isFinite(inspectedDuration) || inspectedDuration <= 0) {
    throw new RemuxError("invalid-duration", "The input duration is invalid.")
  }
  if (Math.abs(plan.sourceDuration - inspectedDuration) > METADATA_DURATION_TOLERANCE_SECONDS) {
    throw new RemuxError(
      "plan-duration-mismatch",
      "The extension plan no longer matches the selected file.",
    )
  }
}

export function scheduleTrackPackets(
  track: TrackKind,
  packets: readonly PacketRecord[],
  plan: ExtensionPlan,
  signal?: AbortSignal,
  sourceTrackDuration = plan.sourceDuration,
) {
  const ledger: PacketLedgerEntry[] = []
  const hasVideoTailGap =
    track === "video" && plan.sourceDuration - sourceTrackDuration > TIMELINE_TOLERANCE_SECONDS
  const presentationLatestPacket = hasVideoTailGap
    ? packets.reduce<PacketRecord | null>((latest, packet) => {
        if (!latest) return packet
        return packet.timestamp + packet.duration > latest.timestamp + latest.duration
          ? packet
          : latest
      }, null)
    : null
  const repetitionCount = legacyForwardRepetitionCount(plan)

  for (let repetition = 0; repetition < repetitionCount; repetition += 1) {
    throwIfAborted(signal)
    const offset = repetition * plan.sourceDuration

    for (const packet of packets) {
      const timestamp = packet.timestamp + offset
      if (timestamp >= plan.outputDuration - Number.EPSILON) continue

      // When another GOP follows, the MP4 muxer derives the final presentation sample's
      // duration from the next keyframe. Model that metadata adjustment in the ledger.
      const packetDuration =
        packet === presentationLatestPacket && repetition < repetitionCount - 1
          ? plan.sourceDuration - packet.timestamp
          : packet.duration
      const duration = Math.min(packetDuration, plan.outputDuration - timestamp)
      if (duration <= 0) continue

      ledger.push({
        track,
        sourceIndex: packet.sourceIndex,
        repetition,
        timestamp,
        duration,
        type: packet.type,
        hash: packet.hash,
      })
    }
  }

  return ledger
}
