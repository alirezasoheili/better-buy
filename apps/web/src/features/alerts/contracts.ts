export type WishlistItem = { id: string; phrase: string; createdAt: string };
export type Wishlist = {
  items: WishlistItem[];
  defaultLocationId: string | null;
  pushPublicKey: string | null;
  scheduleEnabled?: boolean;
};
export type InboxNotification = {
  id: string;
  title: string;
  body: string;
  matches: {
    phrase: string;
    title: string;
    price: number;
    discountPercent: number;
    url: string;
    source: string;
  }[];
  createdAt: string;
  readAt: string | null;
  scanId: string;
  locationId: string;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid record");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid text");
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Invalid number");
  return value;
}
function list<Value>(value: unknown, parse: (item: unknown) => Value): Value[] {
  if (!Array.isArray(value)) throw new Error("Invalid list");
  return value.map(parse);
}
export function parseWishlist(value: unknown): Wishlist {
  const data = record(value);
  return {
    items: list(data.items, (value) => {
      const item = record(value);
      return {
        id: text(item.id),
        phrase: text(item.phrase),
        createdAt: text(item.createdAt),
      };
    }),
    defaultLocationId: nullableText(data.defaultLocationId),
    pushPublicKey: nullableText(data.pushPublicKey),
    ...(typeof data.scheduleEnabled === "boolean"
      ? { scheduleEnabled: data.scheduleEnabled }
      : {}),
  };
}
export function parseNotifications(value: unknown): InboxNotification[] {
  return list(value, (value) => {
    const item = record(value);
    return {
      id: text(item.id),
      title: text(item.title),
      body: text(item.body),
      createdAt: text(item.createdAt),
      readAt: nullableText(item.readAt),
      scanId: text(item.scanId),
      locationId: text(item.locationId),
      matches: list(item.matches, (value) => {
        const match = record(value);
        return {
          phrase: text(match.phrase),
          title: text(match.title),
          price: number(match.price),
          discountPercent: number(match.discountPercent),
          url: text(match.url),
          source: text(match.source),
        };
      }),
    };
  });
}
export function safeOfferUrl(value: string): string | undefined {
  try {
    const base = "https://better-buy.invalid";
    const url = new URL(value, base);
    if (value.startsWith("/"))
      return url.origin === base
        ? url.pathname + url.search + url.hash
        : undefined;
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
