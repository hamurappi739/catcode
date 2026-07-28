CREATE SCHEMA IF NOT EXISTS catcode_admin;
REVOKE ALL ON SCHEMA catcode_admin FROM PUBLIC;

CREATE OR REPLACE VIEW catcode_admin.license_overview AS
SELECT
  l.id,
  l.key_prefix,
  l.product_code,
  l.status,
  l.buyer_email,
  l.payment_reference,
  l.notes,
  l.max_devices,
  l.expires_at,
  l.created_at,
  l.updated_at,
  l.revoked_at,
  count(d.id) FILTER (WHERE d.deactivated_at IS NULL)::int AS active_device_count,
  max(d.last_seen_at) AS last_seen_at,
  max(d.first_activated_at) AS first_activated_at
FROM public.licenses AS l
LEFT JOIN public.license_devices AS d ON d.license_id = l.id
GROUP BY l.id;

REVOKE ALL ON catcode_admin.license_overview FROM PUBLIC;
