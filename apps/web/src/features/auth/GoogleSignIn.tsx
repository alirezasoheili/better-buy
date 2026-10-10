"use client";
import { useState } from "react";
import { authClient } from "../../app/auth-client";
export function GoogleSignIn() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const login = async () => {
    setError("");
    setSubmitting(true);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) throw new Error("sign-in rejected");
    } catch {
      setError("شروع ورود با گوگل ممکن نشد؛ دوباره تلاش کنید.");
      setSubmitting(false);
    }
  };
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div className="auth-mark">ب</div>
        <h1 id="sign-in-title">بهتر بخر</h1>
        <p>
          پیشنهادهای اسنپ‌مارکت و اکالا را برای موقعیت تحویل خود پیدا کنید و
          قیمت فروشگاه‌ها را مقایسه کنید.
        </p>
        <button
          className="google-button"
          onClick={() => void login()}
          disabled={submitting}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285f4"
              d="M21.35 12.25c0-.7-.06-1.22-.2-1.77H12v3.34h5.37c-.11.83-.71 2.08-2.04 2.92l-.02.11 2.96 2.29.2.02c1.87-1.72 2.88-4.25 2.88-6.91Z"
            />
            <path
              fill="#34a853"
              d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.07-2.42c-.82.57-1.92.97-3.38.97-2.58 0-4.77-1.71-5.55-4.07l-.1.01-3.08 2.38-.04.1A9.75 9.75 0 0 0 12 21.75Z"
            />
            <path
              fill="#fbbc05"
              d="M6.45 13.87A5.87 5.87 0 0 1 6.14 12c0-.65.11-1.28.3-1.87v-.12l-3.11-2.42-.1.05A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06.98 4.36l3.22-2.49Z"
            />
            <path
              fill="#ea4335"
              d="M12 6.06c1.84 0 3.08.8 3.79 1.46l2.77-2.7C16.83 3.2 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.77 5.39l3.21 2.49C7.23 7.77 9.42 6.06 12 6.06Z"
            />
          </svg>
          {submitting ? "در حال باز کردن گوگل…" : "ادامه با گوگل"}
        </button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <small>
          موقعیت‌ها و تاریخچه در حساب شما نگهداری می‌شوند. برای بررسی پیشنهادها،
          ورود به فروشگاه لازم نیست.
        </small>
      </section>
    </main>
  );
}
