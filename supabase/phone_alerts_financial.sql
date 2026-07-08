-- Nuevas tablas: alertas de móviles + módulo financiero
-- Ejecutar en: https://supabase.com/dashboard/project/lzhzuqmctlkgpxkhkqgt/sql/new

-- ── B.3 Alertas de móviles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ig_phone_alerts (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "phoneRef"    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'ok',        -- 'ok' | 'cambiar'
  "deadCount"   INT  NOT NULL DEFAULT 0,
  reason        TEXT,
  "detectedAt"  TIMESTAMPTZ DEFAULT NOW(),
  "resolvedAt"  TIMESTAMPTZ,
  "updatedAt"   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Parte A: Finanzas ─────────────────────────────────────────────────────

-- Gastos fijos por modelo y mes (e.g. VPN, Adobe, alquiler)
CREATE TABLE IF NOT EXISTS fin_gastos_fijos (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  modelo    TEXT NOT NULL,                          -- nombre del modelo o 'global'
  concepto  TEXT NOT NULL,
  importe   DECIMAL(10,2) NOT NULL,
  mes       TEXT NOT NULL,                          -- formato YYYY-MM
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Gastos variables puntuales por modelo
CREATE TABLE IF NOT EXISTS fin_gastos_variables (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  modelo    TEXT NOT NULL,
  concepto  TEXT NOT NULL,
  importe   DECIMAL(10,2) NOT NULL,
  fecha     DATE NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Reglas de comisión por chatter/empleado
CREATE TABLE IF NOT EXISTS fin_reglas_comision (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "empleadoId"  TEXT NOT NULL,
  modelo        TEXT NOT NULL,
  porcentaje    DECIMAL(5,2) NOT NULL,              -- e.g. 15.00 = 15 %
  base          TEXT NOT NULL DEFAULT 'mensajes_propinas', -- sobre qué aplica
  activa        BOOLEAN DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ DEFAULT NOW()
);

-- Caché de transacciones de Infloww (se rellena vía API)
CREATE TABLE IF NOT EXISTS infloww_cache (
  id           TEXT PRIMARY KEY,                    -- ID de Infloww
  modelo       TEXT,
  tipo         TEXT,                                -- 'suscripcion'|'mensaje_ppv'|'propina'|'refund'|'chargeback'
  importe      DECIMAL(10,2),
  fecha        DATE,
  "rawData"    JSONB,
  "syncedAt"   TIMESTAMPTZ DEFAULT NOW()
);
