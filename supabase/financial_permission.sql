-- Ejecutar en: https://supabase.com/dashboard/project/lzhzuqmctlkgpxkhkqgt/sql/new
-- The financial endpoints (expenses, summary, infloww) only checked requireAuth —
-- any authenticated user, Empleado included, could read/write financial data via
-- the API even though the "Financiero" link is hidden from Empleado in the sidebar.
-- Adds a real permission and grants it to the same roles that already see
-- Financiero in the sidebar (everyone except Empleado).

INSERT INTO permissions (id, name, resource, action)
  VALUES (gen_random_uuid()::text, 'financial:manage', 'financial', 'manage')
  ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions ("roleId", "permissionId")
  SELECT r.id, p.id FROM roles r, permissions p
  WHERE r.name IN ('Super Admin', 'Admin', 'Manager') AND p.name = 'financial:manage'
ON CONFLICT DO NOTHING;
