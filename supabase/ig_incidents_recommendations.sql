-- Tablas nuevas: incidencias y recomendaciones de Instagram
-- Ejecutar en: https://supabase.com/dashboard/project/lzhzuqmctlkgpxkhkqgt/sql/new

CREATE TABLE IF NOT EXISTS ig_incidents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "accountId" TEXT,
  description TEXT NOT NULL,
  tipo TEXT DEFAULT 'general',
  status TEXT DEFAULT 'open',
  "reportedBy" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ig_recommendations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  texto TEXT NOT NULL,
  prioridad TEXT DEFAULT 'media',
  categoria TEXT DEFAULT 'general',
  "createdBy" TEXT DEFAULT 'admin',
  activa BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
