-- Retain the first successful response observation through normalization/replay.
-- Old checkpoints have no verified response time; adapters use their scan start
-- as a conservative stable fallback instead of manufacturing a fresh timestamp.
ALTER TABLE scan_discovery ADD COLUMN observed_at TEXT;
