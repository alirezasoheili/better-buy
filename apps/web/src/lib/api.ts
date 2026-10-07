const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";
export const api = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(`${apiBase}${url}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof body.message === "string"
        ? body.message
        : null;
    const code =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : null;
    throw new Error(message ?? code ?? "درخواست ناموفق بود");
  }
  if (
    response.status !== 204 &&
    (!body || typeof body !== "object" || !("data" in body))
  )
    throw new Error("پاسخ سرویس معتبر نبود؛ دوباره تلاش کنید.");
  // One transport boundary for the shared read-model contracts. Zod remains
  // authoritative for inputs on the Worker; do not duplicate those schemas here.
  return (
    body && typeof body === "object" && "data" in body ? body.data : undefined
  ) as T;
};
