"use client";
import { QuerySession } from "../features/dashboard/QuerySession";
import { authClient } from "./auth-client";
import { Dashboard } from "../features/dashboard/Dashboard";
import { GoogleSignIn } from "../features/auth/GoogleSignIn";
export default function Page() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending)
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="loading-bar" />
        در حال بررسی ورود امن…
      </main>
    );
  if (!session) return <GoogleSignIn />;
  return (
    <QuerySession key={session.user.id}>
      <Dashboard />
    </QuerySession>
  );
}
