import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } })

const { error: e1 } = await sb.from('ig_incidents').select('id').limit(1)
const { error: e2 } = await sb.from('ig_recommendations').select('id').limit(1)
console.log('ig_incidents:', e1 ? `MISSING (${e1.code})` : 'EXISTS')
console.log('ig_recommendations:', e2 ? `MISSING (${e2.code})` : 'EXISTS')

if (e1?.code === '42P01' || e2?.code === '42P01') {
  console.log('\nSQL para crear las tablas en Supabase:')
  console.log(`
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
  `)
}
