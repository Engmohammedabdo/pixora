-- Migration 016: Webhook events table for DB-based idempotency + payment_failed flag

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_processed_at ON webhook_events (processed_at);

-- Flag for payment failure state on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_failed BOOLEAN DEFAULT FALSE;

-- Cleanup function (call periodically or via pg_cron)
CREATE OR REPLACE FUNCTION cleanup_webhook_events()
RETURNS INTEGER AS $$
DECLARE deleted INTEGER;
BEGIN
  DELETE FROM webhook_events WHERE processed_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql;
