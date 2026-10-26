import { normalizeDealGroupText } from "@better-buy/shared";

export const normalizeWishlistText = (text: string) =>
  (normalizeDealGroupText(text) ?? "")
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .toLocaleLowerCase("en");

export const wishlistTokens = (phrase: string) =>
  normalizeWishlistText(phrase).split(" ").filter(Boolean);

export function matchesWishlist(title: string, phrase: string) {
  const normalized = normalizeWishlistText(title);
  const tokens = wishlistTokens(phrase);
  return (
    tokens.length > 0 && tokens.every((token) => normalized.includes(token))
  );
}

export function wishlistMatchSql(titleColumn: string) {
  return `EXISTS (SELECT 1 FROM wishlist_items wi WHERE wi.user_id=? AND NOT EXISTS (
    SELECT 1 FROM json_each(wi.tokens_json) token WHERE instr(${titleColumn},token.value)=0))`;
}
