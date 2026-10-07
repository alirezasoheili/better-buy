const decodeJwt = (token: string): Record<string, unknown> => {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const raw = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(
      atob(raw.padEnd(raw.length + ((4 - (raw.length % 4)) % 4), "="))
    );
  } catch {
    return {};
  }
};
export const tokenExpiry = (token: string) => {
  const payload = decodeJwt(token);
  return typeof payload.exp === "number"
    ? new Date(payload.exp * 1000).toISOString()
    : null;
};

async function keyMaterial(secret: string) {
  const bytes = secret.match(/.{1,2}/g)?.map((x) => parseInt(x, 16));
  const raw =
    bytes && bytes.length === 32 && bytes.every(Number.isFinite)
      ? new Uint8Array(bytes)
      : new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(value: string, secret: string, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyMaterial(secret);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      key,
      new TextEncoder().encode(value)
    )
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv);
  out.set(ciphertext, iv.length);
  return btoa(String.fromCharCode(...out));
}
export async function decrypt(value: string, secret: string, aad: string) {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const key = await keyMaterial(secret);
  const clear = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: new TextEncoder().encode(aad),
    },
    key,
    bytes.slice(12)
  );
  return new TextDecoder().decode(clear);
}
