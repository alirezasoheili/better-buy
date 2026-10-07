import { encrypt, decrypt, tokenExpiry } from "./credential-box";
import { CredentialError } from "../domain/failures";
type ProviderRow = {
  encrypted_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  app_id: string | null;
};

const now = () => new Date().toISOString();
export class Credentials {
  constructor(
    private db: D1Database,
    private userId: string,
    private boxKey: string
  ) {}
  async provider(provider: string): Promise<ProviderRow | null> {
    return this.db
      .prepare(
        "SELECT encrypted_token,encrypted_refresh_token,token_expires_at,app_id FROM provider_settings WHERE user_id=? AND provider=?"
      )
      .bind(this.userId, provider)
      .first<ProviderRow>();
  }
  async saveProvider(
    provider: string,
    token: string,
    fields: {
      appId?: string;
      refreshToken?: string;
      expiresAt?: string | null;
    } = {}
  ) {
    const old = await this.provider(provider);
    const encryptedToken = await encrypt(
      token,
      this.boxKey,
      `${this.userId}:${provider}`
    );
    const refresh = fields.refreshToken
      ? await encrypt(
          fields.refreshToken,
          this.boxKey,
          `${this.userId}:${provider}:refresh`
        )
      : (old?.encrypted_refresh_token ?? null);
    await this.db
      .prepare(
        "INSERT INTO provider_settings(user_id,provider,encrypted_token,encrypted_refresh_token,token_expires_at,app_id,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_token=excluded.encrypted_token,encrypted_refresh_token=excluded.encrypted_refresh_token,token_expires_at=excluded.token_expires_at,app_id=excluded.app_id,updated_at=excluded.updated_at"
      )
      .bind(
        this.userId,
        provider,
        encryptedToken,
        refresh,
        fields.expiresAt ?? tokenExpiry(token),
        fields.appId ?? old?.app_id ?? "",
        now()
      )
      .run();
  }
  async credentials(provider: string) {
    const r = await this.provider(provider);
    if (!r?.encrypted_token) return null;
    try {
      const token = await decrypt(
        r.encrypted_token,
        this.boxKey,
        `${this.userId}:${provider}`
      );
      return {
        token,
        refreshToken: r.encrypted_refresh_token
          ? await decrypt(
              r.encrypted_refresh_token,
              this.boxKey,
              `${this.userId}:${provider}:refresh`
            )
          : null,
        expiresAt: r.token_expires_at,
        appId: r.app_id ?? "",
      };
    } catch {
      throw new CredentialError();
    }
  }
}
