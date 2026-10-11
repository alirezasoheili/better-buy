import {
  cartAddItemSchema,
  cartItemKeySchema,
  cartLocationQuerySchema,
  cartSourceSchema,
  cartUpdateItemSchema,
} from "@better-buy/shared";
import type { Context } from "hono";
import {
  CartError,
  deleteCartItem,
  putCartItem,
  readProviderCart,
  updateCartItem,
} from "../carts";
import { SavedProductsError } from "../saved-products";
import type { Api } from "./types";

function failure(c: Context, error: unknown) {
  if (error instanceof CartError || error instanceof SavedProductsError) {
    if (error.code === "PROJECTION_PENDING") c.header("Retry-After", "1");
    return c.json(
      { error: error.code, retryable: error.code === "PROJECTION_PENDING" },
      error.status
    );
  }
  console.error("Provider cart request failed");
  return c.json({ error: "CART_READ_ERROR", retryable: true }, 503);
}
async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}
export function registerCarts(api: Api) {
  api.get("/api/carts/:source", async (c) => {
    const source = cartSourceSchema.safeParse(c.req.param("source"));
    const query = cartLocationQuerySchema.safeParse(c.req.query());
    if (!source.success) return c.json({ error: "INVALID_SOURCE" }, 400);
    if (!query.success) return c.json({ error: "INVALID_INPUT" }, 400);
    try {
      return c.json({
        data: await readProviderCart(
          c.env.DB,
          c.get("userId"),
          source.data,
          query.data.locationId
        ),
      });
    } catch (error) {
      return failure(c, error);
    }
  });
  api.put("/api/carts/:source/items/:key", async (c) => {
    const source = cartSourceSchema.safeParse(c.req.param("source"));
    const key = cartItemKeySchema.safeParse(c.req.param("key"));
    if (!source.success) return c.json({ error: "INVALID_SOURCE" }, 400);
    if (!key.success) return c.json({ error: "INVALID_ITEM_KEY" }, 400);
    const raw = await body(c);
    const hasScanId =
      raw !== null && typeof raw === "object" && "scanId" in raw;
    const withScan = hasScanId ? cartAddItemSchema.safeParse(raw) : null;
    const update = hasScanId ? null : cartUpdateItemSchema.safeParse(raw);
    if ((hasScanId && !withScan?.success) || (!hasScanId && !update?.success))
      return c.json({ error: "INVALID_INPUT" }, 400);
    try {
      if (withScan?.success)
        await putCartItem(
          c.env.DB,
          c.get("userId"),
          source.data,
          key.data,
          withScan.data.scanId,
          withScan.data.quantity
        );
      else if (update?.success)
        await updateCartItem(
          c.env.DB,
          c.get("userId"),
          source.data,
          key.data,
          update.data.quantity
        );
      return c.body(null, 204);
    } catch (error) {
      return failure(c, error);
    }
  });
  api.delete("/api/carts/:source/items/:key", async (c) => {
    const source = cartSourceSchema.safeParse(c.req.param("source"));
    const key = cartItemKeySchema.safeParse(c.req.param("key"));
    if (!source.success) return c.json({ error: "INVALID_SOURCE" }, 400);
    if (!key.success) return c.json({ error: "INVALID_ITEM_KEY" }, 400);
    try {
      await deleteCartItem(c.env.DB, c.get("userId"), source.data, key.data);
      return c.body(null, 204);
    } catch (error) {
      return failure(c, error);
    }
  });
}
