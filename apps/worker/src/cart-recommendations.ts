import type { CartLine, CartRecommendation } from "@better-buy/shared";

export interface CartOffer {
  vendorId: string;
  vendorCode: string | null;
  vendorTitle: string;
  logoUrl: string | null;
  priceRials: number;
  stock: number;
}
export interface CartOfferLine {
  line: CartLine;
  offers: CartOffer[];
}
const DEFAULT_SEARCH_LIMIT = 50_000;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Finds a minimum-store cover, then minimizes quantity-weighted cost. */
export function recommendCart(
  lines: readonly CartOfferLine[],
  options: { scanAvailable?: boolean; searchLimit?: number } = {}
): CartRecommendation {
  if (!lines.length)
    return {
      status: "empty",
      optimal: true,
      stores: [],
      missingItems: [],
      totalRials: 0,
    };
  if (options.scanAvailable === false)
    return {
      status: "no_scan",
      optimal: false,
      stores: [],
      missingItems: [],
      totalRials: 0,
    };

  // Keep only the cheapest valid offer per store and cart line.
  const eligible = lines.map(({ line, offers }) => {
    const byVendor = new Map<string, CartOffer>();
    for (const offer of offers) {
      if (
        !Number.isFinite(offer.priceRials) ||
        offer.priceRials < 0 ||
        !Number.isFinite(offer.stock) ||
        offer.stock < line.quantity
      )
        continue;
      const prior = byVendor.get(offer.vendorId);
      if (!prior || offer.priceRials < prior.priceRials)
        byVendor.set(offer.vendorId, offer);
    }
    return [...byVendor.values()].sort((a, b) => cmp(a.vendorId, b.vendorId));
  });
  const available = lines.map((_, i) => i).filter((i) => eligible[i]!.length);
  const missing = lines.flatMap((entry, i) =>
    eligible[i]!.length
      ? []
      : [
          {
            ...entry.line,
            reason:
              entry.offers.length > 0
                ? ("insufficient_quantity" as const)
                : ("missing_product" as const),
          },
        ]
  );
  const offersByVendor = new Map<string, Map<number, CartOffer>>();
  for (const i of available)
    for (const offer of eligible[i]!) {
      const map =
        offersByVendor.get(offer.vendorId) ?? new Map<number, CartOffer>();
      map.set(i, offer);
      offersByVendor.set(offer.vendorId, map);
    }
  const vendors = [...offersByVendor.keys()].sort(cmp);
  const costFor = (selected: Set<string>) => {
    const assignments = new Map<number, CartOffer>();
    let total = 0;
    for (const i of available) {
      const offer = eligible[i]!.filter((row) =>
        selected.has(row.vendorId)
      ).sort(
        (a, b) => a.priceRials - b.priceRials || cmp(a.vendorId, b.vendorId)
      )[0];
      if (!offer) return null;
      assignments.set(i, offer);
      total += offer.priceRials * lines[i]!.line.quantity;
    }
    return { total, assignments };
  };
  const coversAll = (selected: Set<string>) =>
    available.every((i) =>
      eligible[i]!.some((offer) => selected.has(offer.vendorId))
    );
  const signature = (selected: Set<string>) =>
    [...selected].sort(cmp).join("\u001f");
  const best: {
    current: {
      selected: Set<string>;
      total: number;
      assignments: Map<number, CartOffer>;
    } | null;
  } = { current: null };
  const consider = (selected: Set<string>) => {
    const result = costFor(selected);
    if (!result) return;
    const prior = best.current;
    const tie =
      prior && result.total === prior.total
        ? cmp(signature(selected), signature(prior.selected))
        : 0;
    if (
      !prior ||
      selected.size < prior.selected.size ||
      (selected.size === prior.selected.size &&
        (result.total < prior.total ||
          (result.total === prior.total && tie < 0)))
    )
      best.current = { selected: new Set(selected), ...result };
  };

  // A deterministic feasible incumbent is useful if the deeper search hits its budget.
  const greedy = new Set<string>();
  for (const i of available)
    greedy.add(
      eligible[i]!.slice().sort(
        (a, b) => a.priceRials - b.priceRials || cmp(a.vendorId, b.vendorId)
      )[0]!.vendorId
    );
  if (coversAll(greedy)) consider(greedy);

  // Exhaustively prove the common one-store and two-store cases before bounded search.
  for (const vendor of vendors) {
    const set = new Set([vendor]);
    if (coversAll(set)) consider(set);
  }
  if (!best.current || best.current.selected.size > 2) {
    for (let a = 0; a < vendors.length; a++)
      for (let b = a + 1; b < vendors.length; b++) {
        const set = new Set([vendors[a]!, vendors[b]!]);
        if (coversAll(set)) consider(set);
      }
  }

  const budget = options.searchLimit ?? DEFAULT_SEARCH_LIMIT;
  let nodes = 0;
  let limited = false;
  const visited = new Set<string>();
  const selected = new Set<string>();
  const visit = () => {
    if (++nodes > budget) {
      limited = true;
      return;
    }
    const key = signature(selected);
    if (visited.has(key)) return;
    visited.add(key);
    if (coversAll(selected)) {
      consider(selected);
      return;
    }
    if (best.current && selected.size >= best.current.selected.size) return;
    let pivot = -1;
    let choices: string[] = [];
    for (const i of available) {
      if (eligible[i]!.some((offer) => selected.has(offer.vendorId))) continue;
      const candidates = eligible[i]!.map((offer) => offer.vendorId).filter(
        (vendor) => !selected.has(vendor)
      );
      if (pivot < 0 || candidates.length < choices.length) {
        pivot = i;
        choices = candidates;
      }
    }
    choices.sort(cmp);
    for (const vendor of choices) {
      selected.add(vendor);
      visit();
      selected.delete(vendor);
      if (limited) return;
    }
  };
  if (!best.current || best.current.selected.size > 2) visit();
  const chosen = best.current?.selected ?? new Set<string>();
  const final = best.current ?? {
    selected: chosen,
    total: 0,
    assignments: new Map<number, CartOffer>(),
  };
  const storeGroups = new Map<
    string,
    {
      offer: CartOffer;
      items: (CartLine & { priceRials: number; lineTotalRials: number })[];
    }
  >();
  for (const [i, offer] of final.assignments) {
    const group = storeGroups.get(offer.vendorId) ?? { offer, items: [] };
    const quantity = lines[i]!.line.quantity;
    group.items.push({
      ...lines[i]!.line,
      priceRials: offer.priceRials,
      lineTotalRials: offer.priceRials * quantity,
    });
    storeGroups.set(offer.vendorId, group);
  }
  const stores = [...storeGroups]
    .sort(([a], [b]) => cmp(a, b))
    .map(([vendorId, group]) => ({
      vendorId,
      vendorCode: group.offer.vendorCode,
      vendorTitle: group.offer.vendorTitle,
      logoUrl: group.offer.logoUrl ?? null,
      items: group.items,
      totalRials: group.items.reduce(
        (sum, item) => sum + item.lineTotalRials,
        0
      ),
    }));
  return {
    status: missing.length ? "partial" : limited ? "search_limit" : "complete",
    optimal: !limited,
    stores,
    missingItems: missing,
    totalRials: stores.reduce((sum, store) => sum + store.totalRials, 0),
    ...(limited ? { searchLimit: budget } : {}),
  };
}
