-- Link ig_accounts to erp_users via employeeId
ALTER TABLE ig_accounts
  ADD COLUMN IF NOT EXISTS "employeeId" TEXT REFERENCES erp_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ig_accounts_employee_id ON ig_accounts("employeeId");
