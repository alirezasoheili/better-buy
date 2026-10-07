-- SnappMarket now uses ephemeral, Worker-owned PWA guest sessions.
-- Keep all other provider settings, tenants, locations, scans, and deals intact.
DELETE FROM provider_settings WHERE provider = 'snappmarket';
