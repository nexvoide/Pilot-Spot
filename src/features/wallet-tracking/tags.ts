export const MAX_WALLET_TAGS = 3;
export const MAX_WALLET_TAG_LENGTH = 24;
export const SUGGESTED_WALLET_TAGS = [
  "Smart Money",
  "Market Maker",
  "Insider",
] as const;

export function validWalletTags(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_WALLET_TAGS) return false;
  const seen = new Set<string>();
  for (const tag of value) {
    if (
      typeof tag !== "string" ||
      !tag ||
      tag !== tag.trim() ||
      tag.length > MAX_WALLET_TAG_LENGTH ||
      /\p{Cc}/u.test(tag)
    )
      return false;
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
