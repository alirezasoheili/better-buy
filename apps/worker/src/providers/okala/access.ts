import { Effect } from "effect";
import { z } from "zod";
import { requestJson } from "../../infrastructure/http";
import { CollectorError } from "../../domain/failures";
const tokenSchema = z.object({
  access_token: z.string().trim().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
});

function clientSecret(value: string) {
  let secret = value?.trim() ?? "";
  try {
    if (/%[0-9a-f]{2}/i.test(secret)) secret = decodeURIComponent(secret);
  } catch {
    /* Preserve configured values that are not valid percent-encoding. */
  }
  return secret;
}
const tokenHeaders = () => ({
  accept: "application/json, text/plain, */*",
  "content-type": "application/x-www-form-urlencoded",
  origin: "https://www.okala.com",
  referer: "https://www.okala.com/",
  source: "okala",
  "ui-version": "2.0",
  "session-id": crypto.randomUUID(),
});

function tokens(form: URLSearchParams) {
  return Effect.gen(function* () {
    const response = yield* requestJson(
      "https://apigateway.okala.com/api/v1/accounts/tokens",
      { method: "POST", headers: tokenHeaders(), body: form },
      { provider: "اکالا" }
    );
    const parsed = tokenSchema.safeParse(response.body);
    if (!parsed.success)
      return yield* Effect.fail(
        new CollectorError(
          "UPSTREAM_CHANGED",
          "ساختار پاسخ دسترسی اکالا تغییر کرده است"
        )
      );
    return parsed.data;
  });
}

export function refreshOkalaAccessToken(secret: string, refreshToken: string) {
  return Effect.gen(function* () {
    const body = yield* tokens(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "customer_client_id",
        client_secret: clientSecret(secret),
        scope: "offline_access",
        refresh_token: refreshToken,
      })
    );
    return {
      token: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresAt: new Date(
        Date.now() + (body.expires_in ?? 36_000) * 1000
      ).toISOString(),
    };
  });
}

export function requestOkalaOtp(mobile: string) {
  return requestJson(
    "https://apigateway.okala.com/api/voyager/C/CustomerAccount/OTPRegister",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        source: "okala",
        "ui-version": "2.0",
        "session-id": crypto.randomUUID(),
        "x-user-unique-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        mobile,
        deviceTypeCode: 10,
        confirmTerms: true,
        notRobot: false,
        otpType: 0,
        ValidationCodeCreateReason: 5,
        OtpApp: 0,
        IsAppOnly: false,
      }),
    },
    { provider: "اکالا", discardBody: true }
  ).pipe(Effect.asVoid);
}

export function loginOkala(secret: string, mobile: string, otp: string) {
  return Effect.gen(function* () {
    const body = yield* tokens(
      new URLSearchParams({
        mobile_number: mobile,
        otp_code: otp,
        grant_type: "customer_grant_type",
        client_id: "customer_client_id",
        client_secret: clientSecret(secret),
        client_name: "customer_client_name",
        device_type_code: "10",
        scope: "offline_access",
        loginDuration: "77489",
      })
    );
    return {
      token: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: new Date(
        Date.now() + (body.expires_in ?? 36_000) * 1000
      ).toISOString(),
    };
  });
}
