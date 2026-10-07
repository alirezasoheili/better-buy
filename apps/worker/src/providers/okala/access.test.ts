import { Effect } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { loginOkala, refreshOkalaAccessToken, requestOkalaOtp } from "./access";

afterEach(() => vi.restoreAllMocks());
it("preserves Okala refresh form construction and retains the refresh token when none is rotated", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({ access_token: "renewed", expires_in: 3600 })
    );
  const result = await Effect.runPromise(
    refreshOkalaAccessToken("configured%2Bsecret", "refresh-fixture")
  );
  expect(result).toMatchObject({
    token: "renewed",
    refreshToken: "refresh-fixture",
  });
  expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain(
    "grant_type=refresh_token"
  );
  expect(
    new URLSearchParams(String(fetcher.mock.calls[0]?.[1]?.body)).get(
      "client_secret"
    )
  ).toBe("configured+secret");
});
it("decodes login access and refresh tokens without persisting an OTP", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      access_token: "access-fixture",
      refresh_token: "refresh-fixture",
      expires_in: 3600,
    })
  );
  const result = await Effect.runPromise(
    loginOkala("secret-fixture", "09120000000", "12345")
  );
  expect(result).toMatchObject({
    token: "access-fixture",
    refreshToken: "refresh-fixture",
  });
  expect(JSON.stringify(result)).not.toContain("12345");
  expect(
    new URLSearchParams(String(fetcher.mock.calls[0]?.[1]?.body)).get(
      "grant_type"
    )
  ).toBe("customer_grant_type");
});
it("accepts an OTP success without requiring a JSON response body", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }));
  await Effect.runPromise(requestOkalaOtp("09120000000"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    mobile: "09120000000",
    deviceTypeCode: 10,
    IsAppOnly: false,
  });
});
it("rejects malformed token data without repeating authentication", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ access_token: "", expires_in: 0 }));
  await expect(
    Effect.runPromise(refreshOkalaAccessToken("secret", "refresh"))
  ).rejects.toMatchObject({ code: "UPSTREAM_CHANGED" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
