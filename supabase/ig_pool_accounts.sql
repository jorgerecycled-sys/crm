-- Ejecutar en: https://supabase.com/dashboard/project/_/sql/new
-- Cuentas de Instagram desechables (pool "JailBreak" y "Pool Accounts").
-- Viven en la misma tabla ig_accounts, marcadas con la columna "pool", para
-- reutilizar el scraper diario (ig-sync) y todo el historial de mediciones
-- sin duplicar infraestructura. Al promocionarse, "pool" vuelve a NULL.

ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS "pool" TEXT;                    -- 'jailbreak' | 'pool' | NULL (cuenta normal)
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS "poolAssignedAt" TIMESTAMP(3);  -- cuándo se auto-asignó un empleado
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS "poolAssignedFollowers" INTEGER; -- snapshot de seguidores al asignarse

CREATE INDEX IF NOT EXISTS idx_ig_accounts_pool ON ig_accounts ("pool", status);

-- Nuevo permiso para administrar el pool (alta masiva .txt + auditoría de asignaciones),
-- otorgado a Admin y Super Admin.
INSERT INTO permissions (id, name, resource, action)
  VALUES (gen_random_uuid()::text, 'pool-accounts:manage', 'pool-accounts', 'manage')
  ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions ("roleId", "permissionId")
  SELECT r.id, p.id FROM roles r, permissions p
  WHERE r.name IN ('Admin', 'Super Admin') AND p.name = 'pool-accounts:manage'
ON CONFLICT DO NOTHING;
