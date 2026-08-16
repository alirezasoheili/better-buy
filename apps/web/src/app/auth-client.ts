"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin in the deployed Worker. The optional base URL keeps local split-dev usable.
export const authClient = createAuthClient({ baseURL: process.env.NEXT_PUBLIC_AUTH_BASE_URL || undefined });
