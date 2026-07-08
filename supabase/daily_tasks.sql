-- Tareas diarias por empleado / cuenta
-- Ejecutar en: https://supabase.com/dashboard/project/lzhzuqmctlkgpxkhkqgt/sql/new

CREATE TABLE IF NOT EXISTS ig_daily_tasks (
  id            TEXT PRIMARY KEY,              -- determinista: fecha_accountId_tipo_num
  fecha         DATE NOT NULL,
  "employeeId"  TEXT NOT NULL,                 -- ig_accounts.employee
  "phoneRef"    TEXT NOT NULL,
  "accountId"   TEXT,                          -- null en tareas crear_cuenta
  username      TEXT,                          -- @handle (desnormalizado)
  tipo          TEXT NOT NULL,                 -- 'crear_cuenta' | 'reel' | 'historia'
  num           SMALLINT NOT NULL DEFAULT 1,   -- 1 ó 2
  status        TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'hecha'
  "doneAt"      TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ig_daily_tasks_fecha_emp
  ON ig_daily_tasks (fecha, "employeeId");

CREATE INDEX IF NOT EXISTS ig_daily_tasks_fecha_phone
  ON ig_daily_tasks (fecha, "phoneRef");

-- Registrar generate-tasks en el robot
INSERT INTO robot_config ("jobName", label, "preferredHour") VALUES
  ('generate-tasks', 'Generación de tareas diarias', 5)
ON CONFLICT ("jobName") DO NOTHING;
