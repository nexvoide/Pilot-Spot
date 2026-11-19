export type PositionTier = "Leviathan" | "Whale" | "Shark" | "Minnow";

export function positionTier(
  value: number | null | undefined,
): PositionTier | null {
  if (
    value == null ||
    !Number.isFinite(value) ||
    value < 100_000 ||
    value > 1_000_000_000
  )
    return null;
  if (value >= 100_000_000) return "Leviathan";
  if (value >= 10_000_000) return "Whale";
  if (value >= 1_000_000) return "Shark";
  return "Minnow";
}
