import { Cause, Context, Effect, Option } from "effect";
import {
  API_ERROR_MESSAGES,
  isWithinTehranBoundary,
  type DealRecord,
  type LocationRecord,
  type ScanRecord,
} from "@better-buy/shared";
import {
  CollectorError,
  PersistenceError,
  ScanValidationError,
  type ScanFailure,
} from "../domain/failures";

export type ScanInput = {
  locationId: string;
  source: ScanRecord["source"];
  threshold: number;
  mode: ScanRecord["mode"];
};
export type Counts = { vendorCount: number; productCount: number };
export type Collection = Counts & {
  deals: Omit<DealRecord, "scanId" | "state">[];
};
export type Access = null;
export type ScanJob = ScanInput & {
  id: string;
  location: LocationRecord;
  access: Access;
};

export class ScanPersistence extends Context.Service<
  ScanPersistence,
  {
    location: (
      id: string
    ) => Effect.Effect<LocationRecord | null, PersistenceError>;
    active: () => Effect.Effect<{ id: string } | null, PersistenceError>;
    reserve: (
      input: ScanInput
    ) => Effect.Effect<string, PersistenceError | ScanValidationError>;
    running: (id: string) => Effect.Effect<void, PersistenceError>;
    progress: (
      id: string,
      counts: Counts
    ) => Effect.Effect<void, PersistenceError>;
    succeed: (
      id: string,
      result: Collection
    ) => Effect.Effect<void, PersistenceError>;
    fail: (
      id: string,
      code: string,
      message: string
    ) => Effect.Effect<void, PersistenceError>;
  }
>()("better-buy/ScanPersistence") {}

export class ProviderAccess extends Context.Service<
  ProviderAccess,
  {
    establish: (
      source: ScanInput["source"]
    ) => Effect.Effect<Access, ScanFailure>;
  }
>()("better-buy/ProviderAccess") {}

export class ProviderCollection extends Context.Service<
  ProviderCollection,
  {
    collect: (
      job: ScanJob,
      progress: (counts: Counts) => Effect.Effect<void, PersistenceError>
    ) => Effect.Effect<Collection, ScanFailure>;
  }
>()("better-buy/ProviderCollection") {}

export const prepareScan = (input: ScanInput) =>
  Effect.gen(function* () {
    if (input.source === "digikalajet")
      return yield* Effect.fail(
        new ScanValidationError(
          "PROVIDER_UNAVAILABLE",
          API_ERROR_MESSAGES.PROVIDER_UNAVAILABLE
        )
      );
    const persistence = yield* ScanPersistence;
    const location = yield* persistence.location(input.locationId);
    if (!location)
      return yield* Effect.fail(
        new ScanValidationError(
          "LOCATION_NOT_FOUND",
          "موقعیت تحویل پیدا نشد.",
          404
        )
      );
    if (!isWithinTehranBoundary(location.latitude, location.longitude))
      return yield* Effect.fail(
        new ScanValidationError(
          "OUTSIDE_TEHRAN",
          API_ERROR_MESSAGES.OUTSIDE_TEHRAN,
          422
        )
      );
    if (yield* persistence.active())
      return yield* Effect.fail(
        new ScanValidationError(
          "SCAN_IN_PROGRESS",
          API_ERROR_MESSAGES.SCAN_IN_PROGRESS
        )
      );
    const access = yield* (yield* ProviderAccess).establish(input.source);
    const storedInput = {
      ...input,
      threshold:
        input.source === "okala"
          ? Math.max(30, input.threshold)
          : input.threshold,
    };
    const id = yield* persistence.reserve(storedInput);
    // Keep the collector's original threshold; Okala's stored comparison threshold has a floor.
    return { ...input, id, location, access } satisfies ScanJob;
  });

export const COLLECT_BUDGET_MS = 22_000;

export const executeScan = (job: ScanJob, budgetMs = COLLECT_BUDGET_MS) =>
  Effect.gen(function* () {
    const persistence = yield* ScanPersistence;
    const workflow = Effect.gen(function* () {
      const result = yield* Effect.gen(function* () {
        yield* persistence.running(job.id);
        const collector = yield* ProviderCollection;
        return yield* collector.collect(job, (counts) =>
          persistence.progress(job.id, counts)
        );
      }).pipe(
        Effect.timeoutOrElse({
          duration: budgetMs,
          orElse: () =>
            Effect.fail(
              new CollectorError(
                "REQUEST_TIMEOUT",
                "زمان اجرای اسکن به پایان رسید؛ دوباره تلاش کنید."
              )
            ),
        })
      );
      // D1 has no cancellation API. Await the atomic batch even if interrupted so
      // a failure finalizer cannot race a success commit whose outcome is unknown.
      yield* persistence.succeed(job.id, result);
    });
    yield* workflow.pipe(
      Effect.catchCause((cause) => {
        const expected = Cause.findErrorOption(cause);
        const failure =
          Option.isSome(expected) && !Cause.hasDies(cause)
            ? expected.value
            : null;
        const code =
          failure?.code ??
          (Cause.hasInterrupts(cause) ? "INTERRUPTED" : "UNKNOWN_ERROR");
        const message =
          failure?.message ?? "اسکن با خطای برنامه متوقف شد؛ دوباره تلاش کنید.";
        // Never log a cause: it can contain upstream bodies or personal credentials.
        return Effect.gen(function* () {
          if (!failure)
            yield* Effect.sync(() =>
              console.error("Scan execution defect", { scanId: job.id, code })
            );
          yield* persistence.fail(job.id, code, message);
        });
      })
    );
  });
