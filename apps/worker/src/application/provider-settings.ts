import { Effect } from "effect";
import type { ProviderSettingsStatus } from "@better-buy/shared";
import type { CollectorError, PersistenceError } from "../domain/failures";

export type OkalaCredentials = {
  token: string;
  refreshToken?: string;
  expiresAt: string;
};

// Login and storage are separate capabilities. The application owns their order.
export const connectOkala = (
  login: Effect.Effect<OkalaCredentials, CollectorError>,
  persistence: {
    save: (
      credentials: OkalaCredentials
    ) => Effect.Effect<void, PersistenceError>;
    status: Effect.Effect<ProviderSettingsStatus, PersistenceError>;
  }
) =>
  Effect.gen(function* () {
    const credentials = yield* login;
    yield* persistence.save(credentials);
    return yield* persistence.status;
  });
