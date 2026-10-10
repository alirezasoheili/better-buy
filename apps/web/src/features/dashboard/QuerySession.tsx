"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { retryApplicationRead, readRetryDelay } from "../../lib/queryPolicy";
export function createDashboardQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: retryApplicationRead,
        retryDelay: readRetryDelay,
        staleTime: 60_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        networkMode: "always",
      },
      mutations: { retry: false, gcTime: 0, networkMode: "always" },
    },
  });
}
// The session-keyed component owns its cache. No client is shared across users.
export function QuerySession({ children }: { children: ReactNode }) {
  const [client] = useState(createDashboardQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
