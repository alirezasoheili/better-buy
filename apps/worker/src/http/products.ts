import type { Api } from "./types";
import {
  readProductPage,
  readOfferPage,
  SavedProductsError,
} from "../saved-products";
import type { Context } from "hono";

function failure(c: Context, error: unknown) {
  if (error instanceof SavedProductsError) {
    if (error.code === "PROJECTION_PENDING") c.header("Retry-After", "1");
    return c.json(
      { error: error.code, retryable: error.code === "PROJECTION_PENDING" },
      error.status
    );
  }
  console.error("Saved product projection read failed");
  return c.json({ error: "RESULT_READ_ERROR", retryable: true }, 503);
}
/** Register before the legacy /products array handler; page=1 opts into S08. */
export function registerPagedProducts(api: Api) {
  api.get("/api/scans/:id/products", async (c, next) => {
    if (c.req.query("page") !== "1") return next();
    try {
      return c.json({
        data: await readProductPage(
          c.env.DB,
          c.get("userId"),
          c.req.param("id"),
          c.req.query()
        ),
      });
    } catch (error) {
      return failure(c, error);
    }
  });
  api.get("/api/scans/:id/products/:key/offers", async (c) => {
    try {
      return c.json({
        data: await readOfferPage(
          c.env.DB,
          c.get("userId"),
          c.req.param("id"),
          c.req.param("key"),
          c.req.query()
        ),
      });
    } catch (error) {
      return failure(c, error);
    }
  });
}
