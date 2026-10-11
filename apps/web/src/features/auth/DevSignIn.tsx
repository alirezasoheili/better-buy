"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useState } from "react";
import { api } from "../../lib/api";
import { authClient } from "../../app/auth-client";

export function DevSignIn() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api("/api/auth/test-login", { method: "POST" });
      const session = await authClient.getSession();
      if (!session.data?.user) {
        setError(
          "The browser did not keep the login session. Restart pnpm dev and try again."
        );
        setSubmitting(false);
        return;
      }
      window.location.reload();
    } catch {
      setError(
        "Local login failed. Check that the API is running with DEV_MODE=true."
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell" dir="ltr">
      <Card className="auth-card" aria-labelledby="dev-sign-in-title">
        <h1 id="dev-sign-in-title">Local development</h1>
        <p>Use the local test account to develop without Google login.</p>
        <Button
          variant="outline"
          className="google-button"
          disabled={submitting}
          onClick={() => void login()}
        >
          {submitting ? "Signing in…" : "Continue as local test user"}
        </Button>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </Card>
    </main>
  );
}
