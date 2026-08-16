import type {
  DealRecord,
  LocationRecord,
  ProviderSettingsStatus,
  ScanRecord,
  SettingsStatus,
} from "@better-buy/shared";

type ProviderRow = {
  encrypted_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  app_version: string | null;
  app_id: string | null;
};

const now = () => new Date().toISOString();
const text = (v: unknown) => (v == null ? null : String(v));
const decodeJwt = (token: string): Record<string, unknown> => {
  try {
    const part = token.split(".")[1];
    if (!part) return {};
    const raw = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(
      atob(raw.padEnd(raw.length + ((4 - (raw.length % 4)) % 4), "=")),
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
      new TextEncoder().encode(value),
    ),
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
    bytes.slice(12),
  );
  return new TextDecoder().decode(clear);
}

export class Store {
  constructor(
    private db: D1Database,
    private userId: string,
    private boxKey: string,
  ) {}
  async ensureDefaultLocation() {
    const existing = await this.db
      .prepare("SELECT id FROM locations WHERE user_id=? LIMIT 1")
      .bind(this.userId)
      .first();
    if (!existing) {
      const id = crypto.randomUUID(),
        at = now();
      await this.db
        .prepare(
          "INSERT INTO locations(id,user_id,name,latitude,longitude,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(id, this.userId, "تهران — خانه", 35.7285, 51.309056, 1, at, at)
        .run();
    }
  }
  async locations(): Promise<LocationRecord[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM locations WHERE user_id=? AND NOT (name='تهران — خانه' AND latitude=35.7285 AND longitude=51.309056) ORDER BY is_default DESC, created_at",
      )
      .bind(this.userId)
      .all<any>();
    return results.map(this.mapLocation);
  }
  async location(id: string) {
    const r = await this.db
      .prepare(
        "SELECT * FROM locations WHERE user_id=? AND id=? AND NOT (name='تهران — خانه' AND latitude=35.7285 AND longitude=51.309056)",
      )
      .bind(this.userId, id)
      .first<any>();
    return r ? this.mapLocation(r) : null;
  }
  private mapLocation(r: any): LocationRecord {
    return {
      id: r.id,
      name: r.name,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      isDefault: !!r.is_default,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
  async createLocation(v: {
    name: string;
    latitude: number;
    longitude: number;
    isDefault?: boolean;
  }) {
    const id = crypto.randomUUID(),
      at = now();
    const stmts = [];
    if (v.isDefault)
      stmts.push(
        this.db
          .prepare("UPDATE locations SET is_default=0 WHERE user_id=?")
          .bind(this.userId),
      );
    stmts.push(
      this.db
        .prepare(
          "INSERT INTO locations(id,user_id,name,latitude,longitude,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          this.userId,
          v.name,
          v.latitude,
          v.longitude,
          v.isDefault ? 1 : 0,
          at,
          at,
        ),
    );
    await this.db.batch(stmts);
    return this.location(id);
  }
  async updateLocation(id: string, v: Record<string, unknown>) {
    const current = await this.location(id);
    if (!current) return null;
    const merged = { ...current, ...v };
    const stmts = [];
    if (merged.isDefault)
      stmts.push(
        this.db
          .prepare("UPDATE locations SET is_default=0 WHERE user_id=?")
          .bind(this.userId),
      );
    stmts.push(
      this.db
        .prepare(
          "UPDATE locations SET name=?,latitude=?,longitude=?,is_default=?,updated_at=? WHERE user_id=? AND id=?",
        )
        .bind(
          String(merged.name),
          Number(merged.latitude),
          Number(merged.longitude),
          merged.isDefault ? 1 : 0,
          now(),
          this.userId,
          id,
        ),
    );
    await this.db.batch(stmts);
    return this.location(id);
  }
  async deleteLocation(id: string) {
    const count = await this.db
      .prepare("SELECT COUNT(*) AS c FROM locations WHERE user_id=?")
      .bind(this.userId)
      .first<any>();
    if (Number(count?.c) <= 1) return "last";
    const used = await this.db
      .prepare("SELECT 1 FROM scans WHERE user_id=? AND location_id=? LIMIT 1")
      .bind(this.userId, id)
      .first();
    if (used) return "used";
    return (
      await this.db
        .prepare("DELETE FROM locations WHERE user_id=? AND id=?")
        .bind(this.userId, id)
        .run()
    ).meta.changes
      ? "deleted"
      : "missing";
  }
  async provider(provider: string): Promise<ProviderRow | null> {
    return this.db
      .prepare(
        "SELECT encrypted_token,encrypted_refresh_token,token_expires_at,app_version,app_id FROM provider_settings WHERE user_id=? AND provider=?",
      )
      .bind(this.userId, provider)
      .first<ProviderRow>();
  }
  async snappStatus(): Promise<SettingsStatus> {
    const r = await this.provider("snappmarket");
    const expired =
      !!r?.token_expires_at && Date.parse(r.token_expires_at) <= Date.now();
    return {
      tokenConfigured: !!r?.encrypted_token,
      tokenExpired: expired,
      tokenExpiresAt: r?.token_expires_at ?? null,
      appVersion: r?.app_version ?? "1.397.50",
    };
  }
  async digikalaStatus() {
    const r = await this.provider("digikalajet");
    return { tokenConfigured: !!r?.encrypted_token, appId: r?.app_id ?? null };
  }
  async okalaStatus(): Promise<ProviderSettingsStatus> {
    const r = await this.provider("okala");
    const expired =
      !!r?.token_expires_at && Date.parse(r.token_expires_at) <= Date.now();
    return {
      tokenConfigured: !!r?.encrypted_token,
      tokenExpired: expired,
      tokenExpiresAt: r?.token_expires_at ?? null,
    };
  }
  async saveProvider(
    provider: string,
    token: string,
    fields: {
      appVersion?: string;
      appId?: string;
      refreshToken?: string;
      expiresAt?: string | null;
    } = {},
  ) {
    const old = await this.provider(provider);
    const encryptedToken = await encrypt(
      token,
      this.boxKey,
      `${this.userId}:${provider}`,
    );
    const refresh = fields.refreshToken
      ? await encrypt(
          fields.refreshToken,
          this.boxKey,
          `${this.userId}:${provider}:refresh`,
        )
      : (old?.encrypted_refresh_token ?? null);
    await this.db
      .prepare(
        "INSERT INTO provider_settings(user_id,provider,encrypted_token,encrypted_refresh_token,token_expires_at,app_version,app_id,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_token=excluded.encrypted_token,encrypted_refresh_token=excluded.encrypted_refresh_token,token_expires_at=excluded.token_expires_at,app_version=excluded.app_version,app_id=excluded.app_id,updated_at=excluded.updated_at",
      )
      .bind(
        this.userId,
        provider,
        encryptedToken,
        refresh,
        fields.expiresAt ?? tokenExpiry(token),
        fields.appVersion ?? old?.app_version ?? "1.397.50",
        fields.appId ?? old?.app_id ?? "",
        now(),
      )
      .run();
  }
  async credentials(provider: string) {
    const r = await this.provider(provider);
    if (!r?.encrypted_token) return null;
    const token = await decrypt(
      r.encrypted_token,
      this.boxKey,
      `${this.userId}:${provider}`,
    );
    const payload = decodeJwt(token);
    return {
      token,
      udid: typeof payload.udid === "string" ? payload.udid : "",
      refreshToken: r.encrypted_refresh_token
        ? await decrypt(
            r.encrypted_refresh_token,
            this.boxKey,
            `${this.userId}:${provider}:refresh`,
          )
        : null,
      expiresAt: r.token_expires_at,
      appVersion: r.app_version ?? "1.397.50",
      appId: r.app_id ?? "",
    };
  }
  async activeScan() {
    return this.db
      .prepare(
        "SELECT id FROM scans WHERE user_id=? AND status IN ('queued','running') LIMIT 1",
      )
      .bind(this.userId)
      .first<{ id: string }>();
  }
  async reconcileStale() {
    const queuedCutoff = new Date(Date.now() - 2 * 60_000).toISOString();
    const runningCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE scans SET status='failed',finished_at=?,error_code='INTERRUPTED',error_message='اسکن با توقف برنامه متوقف شد' WHERE user_id=? AND status='queued' AND created_at < ?",
        )
        .bind(now(), this.userId, queuedCutoff),
      this.db
        .prepare(
          "UPDATE scans SET status='failed',finished_at=?,error_code='INTERRUPTED',error_message='اسکن با توقف برنامه متوقف شد' WHERE user_id=? AND status='running' AND created_at < ?",
        )
        .bind(now(), this.userId, runningCutoff),
    ]);
  }
  async createScan(
    locationId: string,
    threshold: number,
    source: string,
    mode: string,
  ) {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        this.userId,
        locationId,
        threshold,
        source,
        mode,
        "queued",
        now(),
      )
      .run();
    return id;
  }
  async scan(id: string) {
    const r = await this.db
      .prepare(
        "SELECT s.*,l.name location_name FROM scans s JOIN locations l ON l.id=s.location_id WHERE s.user_id=? AND s.id=?",
      )
      .bind(this.userId, id)
      .first<any>();
    return r ? this.mapScan(r) : null;
  }
  private mapScan(r: any): ScanRecord {
    return {
      id: r.id,
      locationId: r.location_id,
      locationName: r.location_name,
      threshold: r.threshold,
      source: r.source,
      mode: r.mode,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      createdAt: r.created_at,
      vendorCount: r.vendor_count,
      productCount: r.product_count,
      dealCount: r.deal_count,
      errorCode: r.error_code,
      errorMessage: r.error_message,
    };
  }
  async scans() {
    const { results } = await this.db
      .prepare(
        "SELECT s.*,l.name location_name FROM scans s JOIN locations l ON l.id=s.location_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100",
      )
      .bind(this.userId)
      .all<any>();
    return results.map(this.mapScan);
  }
  async markRunning(id: string) {
    await this.db
      .prepare(
        "UPDATE scans SET status='running',started_at=? WHERE user_id=? AND id=?",
      )
      .bind(now(), this.userId, id)
      .run();
  }
  async progress(id: string, c: { vendorCount: number; productCount: number }) {
    await this.db
      .prepare(
        "UPDATE scans SET vendor_count=?,product_count=? WHERE user_id=? AND id=?",
      )
      .bind(c.vendorCount, c.productCount, this.userId, id)
      .run();
  }
  async fail(id: string, code: string, message: string) {
    await this.db
      .prepare(
        "UPDATE scans SET status='failed',finished_at=?,error_code=?,error_message=? WHERE user_id=? AND id=?",
      )
      .bind(now(), code, message, this.userId, id)
      .run();
  }
  async succeed(
    id: string,
    c: { vendorCount: number; productCount: number },
    deals: Omit<DealRecord, "scanId" | "state">[],
  ) {
    const stmts = deals.map((d) =>
      this.db
        .prepare(
          "INSERT INTO deals(id,scan_id,deal_key,product_variation_id,vendor_id,title,image,vendor_title,vendor_code,category_title,price_rials,discount_rials,final_price_rials,discount_ratio,stock) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          d.key,
          d.productVariationId,
          d.vendorId,
          d.title,
          d.image,
          d.vendorTitle,
          d.vendorCode,
          d.categoryTitle,
          d.priceRials,
          d.discountRials,
          d.finalPriceRials,
          d.discountRatio,
          d.stock,
        ),
    );
    stmts.push(
      this.db
        .prepare(
          "UPDATE scans SET status='succeeded',finished_at=?,vendor_count=?,product_count=?,deal_count=? WHERE user_id=? AND id=?",
        )
        .bind(
          now(),
          c.vendorCount,
          c.productCount,
          deals.length,
          this.userId,
          id,
        ),
    );
    await this.db.batch(stmts);
  }
  async deals(id: string): Promise<DealRecord[]> {
    const scan = await this.scan(id);
    if (!scan) return [];
    const { results } = await this.db
      .prepare(
        "SELECT * FROM deals WHERE scan_id=? ORDER BY discount_ratio DESC, final_price_rials",
      )
      .bind(id)
      .all<any>();
    const previous = await this.db
      .prepare(
        "SELECT s.id FROM scans s WHERE s.user_id=? AND s.location_id=? AND s.threshold=? AND s.source=? AND s.status='succeeded' AND s.created_at < ? ORDER BY s.created_at DESC LIMIT 1",
      )
      .bind(
        this.userId,
        scan.locationId,
        scan.threshold,
        scan.source,
        scan.createdAt,
      )
      .first<{ id: string }>();
    const priorRows = previous
      ? (
          await this.db
            .prepare("SELECT * FROM deals WHERE scan_id=?")
            .bind(previous.id)
            .all<any>()
        ).results
      : [];
    const priorKeys = new Set(priorRows.map((r) => r.deal_key));
    const currentKeys = new Set(results.map((r) => r.deal_key));
    const mapDeal = (r: any, state: DealRecord["state"], scanId: string) => ({
      ...r,
      key: r.deal_key,
      scanId,
      productVariationId: r.product_variation_id,
      vendorId: r.vendor_id,
      vendorTitle: r.vendor_title,
      vendorCode: r.vendor_code,
      categoryTitle: r.category_title,
      priceRials: r.price_rials,
      discountRials: r.discount_rials,
      finalPriceRials: r.final_price_rials,
      discountRatio: r.discount_ratio,
      stock: r.stock,
      state,
    });
    return [
      ...results.map((r) =>
        mapDeal(r, priorKeys.has(r.deal_key) ? "still_available" : "new", id),
      ),
      ...priorRows
        .filter((r) => !currentKeys.has(r.deal_key))
        .map((r) => mapDeal(r, "no_longer_present", id)),
    ];
  }
}
