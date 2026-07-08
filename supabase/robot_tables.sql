-- Panel Robot: configuración y log de ejecuciones
-- Ejecutar en: https://supabase.com/dashboard/project/lzhzuqmctlkgpxkhkqgt/sql/new

CREATE TABLE IF NOT EXISTS robot_config (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "jobName"      TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL,
  "preferredHour" INT  NOT NULL DEFAULT 6,  -- hora UTC (0-23)
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  "updatedAt"    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS robot_runs (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "jobName"      TEXT NOT NULL,
  "startedAt"    TIMESTAMPTZ DEFAULT NOW(),
  "finishedAt"   TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'running', -- 'running'|'ok'|'error'|'skipped'
  result         JSONB,
  "errorMessage" TEXT,
  duration       INT,  -- milliseconds
  "triggeredBy"  TEXT DEFAULT 'cron'  -- 'cron'|'manual'
);

CREATE INDEX IF NOT EXISTS robot_runs_job_started ON robot_runs ("jobName", "startedAt" DESC);

-- Configs por defecto
INSERT INTO robot_config ("jobName", label, "preferredHour") VALUES
  ('detect-performance', 'Detección de Rendimiento', 6),
  ('detect-devices',     'Detección de Móviles',     6)
ON CONFLICT ("jobName") DO NOTHING;
