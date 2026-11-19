export type CapitalSnapshot = { valueUsd: number; asOf: string };
export type CapitalCategory = "Leviathan" | "Whale" | "Shark" | "Minnow";

export function capitalCategory(
  value: number | null | undefined,
): CapitalCategory | null {
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
