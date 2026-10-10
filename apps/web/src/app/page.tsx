"use client";
import { QuerySession } from "../features/dashboard/QuerySession";
import { authClient } from "./auth-client";
import { Dashboard } from "../features/dashboard/Dashboard";
import { GoogleSignIn } from "../features/auth/GoogleSignIn";
export default function Page() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  if (isPending)
    return (
      <main className="auth-loading" aria-live="polite">
        در حال بررسی ورود…
      </main>
    );
  if (error && !session)
    return (
      <main className="auth-shell">
        <section className="auth-card" role="status">
          <h1>بررسی ورود انجام نشد</h1>
          <p>برای ادامه، وضعیت حساب را دوباره دریافت کنید.</p>
          <button onClick={() => void refetch()}>دریافت دوباره</button>
        </section>
      </main>
    );
  if (!session) return <GoogleSignIn />;
  return (
    <QuerySession key={session.user.id}>
      <Dashboard />
    </QuerySession>
  );
}
