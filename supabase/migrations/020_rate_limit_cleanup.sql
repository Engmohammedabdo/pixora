-- Migration 020: Cleanup function for login_attempts in system_settings
-- These accumulate indefinitely; clean up entries older than 1 day

CREATE OR REPLACE FUNCTION cleanup_rate_limit_entries()
RETURNS INTEGER AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM system_settings
  WHERE key LIKE 'login_attempts:%'
    AND updated_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql;

-- Also clean up webhook_events older than 7 days (from migration 016)
-- Combined cleanup function for cron scheduling
CREATE OR REPLACE FUNCTION cleanup_stale_records()
RETURNS JSONB AS $$
DECLARE
  v_login_deleted INTEGER;
  v_webhook_deleted INTEGER;
BEGIN
  DELETE FROM system_settings
  WHERE key LIKE 'login_attempts:%'
    AND updated_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS v_login_deleted = ROW_COUNT;

  DELETE FROM webhook_events
  WHERE processed_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_webhook_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'login_attempts_cleaned', v_login_deleted,
    'webhook_events_cleaned', v_webhook_deleted
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule: call cleanup_stale_records() daily via pg_cron
-- Uncomment after enabling pg_cron:
-- SELECT cron.schedule('daily-cleanup', '0 3 * * *', $$SELECT cleanup_stale_records();$$);
