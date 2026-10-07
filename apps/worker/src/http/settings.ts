import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  type ProviderCapabilities,
} from "@better-buy/shared";
import type { Api } from "./types";
export function registerSettings(api: Api) {
  api.on(["GET", "PUT"], "/api/settings/digikalajet", (c) =>
    c.json(
      {
        error: API_ERROR_CODES.PROVIDER_UNAVAILABLE,
        message: API_ERROR_MESSAGES.PROVIDER_UNAVAILABLE,
      },
      409
    )
  );
  api.get("/api/settings/okala", (c) =>
    c.json({
      data: {
        requiresCustomerCredentials: false,
        access: "public",
        coverage: "campaign-feed",
      } satisfies ProviderCapabilities,
    })
  );
}
