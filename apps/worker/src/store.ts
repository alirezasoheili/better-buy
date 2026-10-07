import { compareDeals } from "@better-buy/shared";
import type {
  DealRecord,
  LocationRecord,
  ScanRecord,
} from "@better-buy/shared";

import { Credentials } from "./infrastructure/credentials";
import { ScanValidationError } from "./domain/failures";
const now = () => new Date().toISOString();

type LocationRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_default: number;
  created_at: string;
  updated_at: string;
};
type ScanRow = {
  id: string;
  location_id: string;
  location_name: string;
  threshold: number;
  source: ScanRecord["source"];
  mode: ScanRecord["mode"];
  status: ScanRecord["status"];
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  vendor_count: number;
  product_count: number;
  deal_count: number;
  error_code: string | null;
  error_message: string | null;
};
type DealRow = {
  deal_key: string;
  product_variation_id: string;
  vendor_id: string;
  title: string;
  image: string | null;
  vendor_title: string;
  vendor_code: string | null;
  category_title: string | null;
  price_rials: number;
  discount_rials: number;
  final_price_rials: number;
  discount_ratio: number;
  stock: number;
};

export class Store {
  constructor(
    private db: D1Database,
    private userId: string,
    boxKey: string
  ) {
    this.providerAccess = new Credentials(db, userId, boxKey);
  }
  readonly providerAccess: Credentials;
  async locations(): Promise<LocationRecord[]> {
    const { results } = await this.db
      .prepare(
        "SELECT * FROM locations WHERE user_id=? ORDER BY is_default DESC, created_at"
      )
      .bind(this.userId)
      .all<LocationRow>();
    return results.map(this.mapLocation);
  }
  async location(id: string) {
    const r = await this.db
      .prepare("SELECT * FROM locations WHERE user_id=? AND id=?")
      .bind(this.userId, id)
      .first<LocationRow>();
    return r ? this.mapLocation(r) : null;
  }
  private mapLocation(r: LocationRow): LocationRecord {
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
          .bind(this.userId)
      );
    stmts.push(
      this.db
        .prepare(
          "INSERT INTO locations(id,user_id,name,latitude,longitude,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)"
        )
        .bind(
          id,
          this.userId,
          v.name,
          v.latitude,
          v.longitude,
          v.isDefault ? 1 : 0,
          at,
          at
        )
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
          .bind(this.userId)
      );
    stmts.push(
      this.db
        .prepare(
          "UPDATE locations SET name=?,latitude=?,longitude=?,is_default=?,updated_at=? WHERE user_id=? AND id=?"
        )
        .bind(
          String(merged.name),
          Number(merged.latitude),
          Number(merged.longitude),
          merged.isDefault ? 1 : 0,
          now(),
          this.userId,
          id
        )
    );
    await this.db.batch(stmts);
    return this.location(id);
  }
  async deleteLocation(id: string) {
    const existing = await this.db
      .prepare("SELECT id FROM locations WHERE user_id=? AND id=?")
      .bind(this.userId, id)
      .first<{ id: string }>();
    if (!existing) return "missing";

    const count = await this.db
      .prepare("SELECT COUNT(*) AS c FROM locations WHERE user_id=?")
      .bind(this.userId)
      .first<{ c: number }>();
    if (Number(count?.c) <= 1) return "last";
    const active = await this.db
      .prepare(
        "SELECT 1 FROM scans WHERE user_id=? AND location_id=? AND status IN ('queued','running') LIMIT 1"
      )
      .bind(this.userId, id)
      .first();
    if (active) return "active";

    // A location owns its scan history. Delete dependent deals first, then
    // scans, and finally the location in one D1 batch so no history is left
    // behind when a location is removed.
    const result = await this.db.batch([
      this.db
        .prepare(
          "DELETE FROM deals WHERE scan_id IN (SELECT id FROM scans WHERE user_id=? AND location_id=?)"
        )
        .bind(this.userId, id),
      this.db
        .prepare("DELETE FROM scans WHERE user_id=? AND location_id=?")
        .bind(this.userId, id),
      this.db
        .prepare("DELETE FROM locations WHERE user_id=? AND id=?")
        .bind(this.userId, id),
    ]);
    return result[2]?.meta.changes ? "deleted" : "missing";
  }
  provider(provider: string) {
    return this.providerAccess.provider(provider);
  }
  saveProvider(...args: Parameters<Credentials["saveProvider"]>) {
    return this.providerAccess.saveProvider(...args);
  }
  credentials(provider: string) {
    return this.providerAccess.credentials(provider);
  }
  async activeScan() {
    return this.db
      .prepare(
        "SELECT id FROM scans WHERE user_id=? AND status IN ('queued','running') LIMIT 1"
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
          "UPDATE scans SET status='failed',finished_at=?,error_code='INTERRUPTED',error_message='اسکن با توقف برنامه متوقف شد' WHERE user_id=? AND status='queued' AND created_at < ?"
        )
        .bind(now(), this.userId, queuedCutoff),
      this.db
        .prepare(
          "UPDATE scans SET status='failed',finished_at=?,error_code='INTERRUPTED',error_message='اسکن با توقف برنامه متوقف شد' WHERE user_id=? AND status='running' AND created_at < ?"
        )
        .bind(now(), this.userId, runningCutoff),
    ]);
  }
  async createScan(
    locationId: string,
    threshold: number,
    source: ScanRecord["source"],
    mode: ScanRecord["mode"]
  ) {
    const id = crypto.randomUUID();
    const result = await this.db
      .prepare(
        "INSERT INTO scans(id,user_id,location_id,threshold,source,mode,status,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM locations WHERE id=? AND user_id=?)"
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
        locationId,
        this.userId
      )
      .run();
    if (!result.meta.changes)
      throw new ScanValidationError(
        "LOCATION_NOT_FOUND",
        "موقعیت تحویل پیدا نشد.",
        404
      );
    return id;
  }
  async scan(id: string) {
    const r = await this.db
      .prepare(
        "SELECT s.*,l.name location_name FROM scans s JOIN locations l ON l.id=s.location_id AND l.user_id=s.user_id WHERE s.user_id=? AND s.id=?"
      )
      .bind(this.userId, id)
      .first<ScanRow>();
    return r ? this.mapScan(r) : null;
  }
  private mapScan(r: ScanRow): ScanRecord {
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
        "SELECT s.*,l.name location_name FROM scans s JOIN locations l ON l.id=s.location_id AND l.user_id=s.user_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100"
      )
      .bind(this.userId)
      .all<ScanRow>();
    return results.map(this.mapScan);
  }
  async markRunning(id: string) {
    await this.db
      .prepare(
        "UPDATE scans SET status='running',started_at=? WHERE user_id=? AND id=? AND status='queued'"
      )
      .bind(now(), this.userId, id)
      .run();
  }
  async progress(id: string, c: { vendorCount: number; productCount: number }) {
    await this.db
      .prepare(
        "UPDATE scans SET vendor_count=?,product_count=? WHERE user_id=? AND id=? AND status='running'"
      )
      .bind(c.vendorCount, c.productCount, this.userId, id)
      .run();
  }
  async fail(id: string, code: string, message: string) {
    await this.db
      .prepare(
        "UPDATE scans SET status='failed',finished_at=?,error_code=?,error_message=? WHERE user_id=? AND id=? AND status IN ('queued','running')"
      )
      .bind(now(), code, message, this.userId, id)
      .run();
  }
  async succeed(
    id: string,
    c: { vendorCount: number; productCount: number },
    deals: Omit<DealRecord, "scanId" | "state">[]
  ) {
    const stmts = deals.map((d) =>
      this.db
        .prepare(
          "INSERT INTO deals(id,scan_id,deal_key,product_variation_id,vendor_id,title,image,vendor_title,vendor_code,category_title,price_rials,discount_rials,final_price_rials,discount_ratio,stock) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM scans WHERE id=? AND user_id=? AND status IN ('queued','running'))"
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
          id,
          this.userId
        )
    );
    stmts.push(
      this.db
        .prepare(
          "UPDATE scans SET status='succeeded',finished_at=?,vendor_count=?,product_count=?,deal_count=? WHERE user_id=? AND id=? AND status IN ('queued','running')"
        )
        .bind(
          now(),
          c.vendorCount,
          c.productCount,
          deals.length,
          this.userId,
          id
        )
    );
    await this.db.batch(stmts);
  }
  async deals(id: string): Promise<DealRecord[]> {
    const scan = await this.scan(id);
    if (!scan) return [];
    const { results } = await this.db
      .prepare(
        "SELECT * FROM deals WHERE scan_id=? ORDER BY discount_ratio DESC, final_price_rials"
      )
      .bind(id)
      .all<DealRow>();
    const previous = await this.db
      .prepare(
        "SELECT s.id FROM scans s WHERE s.user_id=? AND s.location_id=? AND s.threshold=? AND s.source=? AND s.status='succeeded' AND s.created_at < ? ORDER BY s.created_at DESC LIMIT 1"
      )
      .bind(
        this.userId,
        scan.locationId,
        scan.threshold,
        scan.source,
        scan.createdAt
      )
      .first<{ id: string }>();
    const priorRows = previous
      ? (
          await this.db
            .prepare("SELECT * FROM deals WHERE scan_id=?")
            .bind(previous.id)
            .all<DealRow>()
        ).results
      : [];
    const mapDeal = (r: DealRow) => ({
      title: r.title,
      image: r.image,
      key: r.deal_key,
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
    });
    return compareDeals(results.map(mapDeal), priorRows.map(mapDeal), id);
  }
}
