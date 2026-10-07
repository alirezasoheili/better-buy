-- Close the check-then-insert race for per-user scans. Completed and failed
-- history remains unlimited; only queued/running rows participate.
CREATE UNIQUE INDEX IF NOT EXISTS scans_one_active_per_user
  ON scans(user_id)
  WHERE status IN ('queued', 'running');
