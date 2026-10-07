"use client";

import { useState } from "react";
import type { ProviderSettingsStatus } from "@better-buy/shared";
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";

export default function OkalaSettings({
    value,
    onSaved,
}: {
    value: ProviderSettingsStatus | null;
    onSaved: (value: ProviderSettingsStatus) => void;
}) {
    const [mobile, setMobile] = useState(""),
        [otp, setOtp] = useState(""),
        [step, setStep] = useState<"mobile" | "otp">("mobile"),
        [saving, setSaving] = useState(false),
        [error, setError] = useState("");
    const requestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const r = await fetch(`${apiBase}/api/settings/okala/otp`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mobile }),
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(body.message ?? "ارسال کد ناموفق بود");
            setStep("otp");
        } catch (err) {
            setError(err instanceof Error ? err.message : "ارسال کد ناموفق بود");
        } finally {
            setSaving(false);
        }
    };
    const verify = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const r = await fetch(`${apiBase}/api/settings/okala/login`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mobile, otp }),
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(body.message ?? "ورود ناموفق بود");
            onSaved(body.data as ProviderSettingsStatus);
            setOtp("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "ورود ناموفق بود");
        } finally {
            setSaving(false);
        }
    };
    return (
        <section className="settings-page okala-settings">
            <header>
                <span>ورود امن</span>
                <h1>ورود به اکالا</h1>
                <p>
                    با شماره موبایل وارد شوید؛ نشست و refresh token فقط به‌صورت رمزگذاری‌شده در همین دستگاه نگه‌داری و
                    خودکار تازه می‌شوند.
                </p>
            </header>
            <div className="credential-status">
                <span className={`status-dot ${value?.tokenConfigured && !value.tokenExpired ? "ok" : "warn"}`} />
                <div>
                    <strong>
                        {value?.tokenConfigured
                            ? value.tokenExpired
                                ? "نشست نیاز به ورود دوباره دارد"
                                : "اکالا متصل و آماده اسکن است"
                            : "هنوز وارد نشده‌اید"}
                    </strong>
                    <small>
                        {value?.tokenExpiresAt
                            ? `دسترسی تا ${new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value.tokenExpiresAt))}`
                            : "برای شروع شماره موبایل را وارد کنید"}
                    </small>
                </div>
            </div>
            {step === "mobile" ? (
                <form onSubmit={requestOtp}>
                    <label>
                        شماره موبایل
                        <input
                            required
                            value={mobile}
                            onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="۰۹۱۲۱۲۳۴۵۶۷"
                            inputMode="tel"
                            autoComplete="tel"
                            dir="ltr"
                        />
                    </label>
                    {error && <p className="form-error">{error}</p>}
                    <button disabled={saving}>{saving ? "در حال ارسال…" : "ارسال کد پیامک"}</button>
                </form>
            ) : (
                <form onSubmit={verify}>
                    <label>
                        کد پیامک
                        <input
                            required
                            autoFocus
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                            placeholder="کد ۵ رقمی"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            dir="ltr"
                        />
                    </label>
                    <p className="otp-help">
                        کد به {mobile} ارسال شد.{" "}
                        <button
                            type="button"
                            onClick={() => {
                                setStep("mobile");
                                setOtp("");
                                setError("");
                            }}
                        >
                            ویرایش شماره
                        </button>
                    </p>
                    {error && <p className="form-error">{error}</p>}
                    <button disabled={saving}>{saving ? "در حال ورود…" : "تأیید و اتصال اکالا"}</button>
                </form>
            )}
            <aside>
                <strong>حریم خصوصی</strong>
                <p>کد پیامک هرگز ذخیره نمی‌شود. اگر نشست باطل شود، فقط همان زمان دوباره کد می‌خواهیم.</p>
            </aside>
        </section>
    );
}
