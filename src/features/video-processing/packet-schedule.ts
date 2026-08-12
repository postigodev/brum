import type { ExtensionPlan } from "#/features/video-selection/extension-plan"

import { RemuxError, throwIfAborted } from "./errors"
import type { PacketLedgerEntry, PacketRecord, TrackKind } from "./types"

export const TIMELINE_TOLERANCE_SECONDS = 0.001

export function assertPlanMatchesSource(plan: ExtensionPlan, inspectedDuration: number) {
  if (!Number.isFinite(inspectedDuration) || inspectedDuration <= 0) {
    throw new RemuxError("invalid-duration", "The input duration is invalid.")
  }
  if (Math.abs(plan.sourceDuration - inspectedDuration) > TIMELINE_TOLERANCE_SECONDS) {
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
) {
  const ledger: PacketLedgerEntry[] = []

  for (let repetition = 0; repetition < plan.totalPlays; repetition += 1) {
    throwIfAborted(signal)
    const offset = repetition * plan.sourceDuration

    for (const packet of packets) {
      const timestamp = packet.timestamp + offset
      if (timestamp >= plan.outputDuration - Number.EPSILON) continue

      const duration = Math.min(packet.duration, plan.outputDuration - timestamp)
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
