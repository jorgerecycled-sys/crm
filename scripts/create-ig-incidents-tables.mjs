// Run with: node scripts/create-ig-incidents-tables.mjs
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { auth: { persistSession: false } }
)

const sql = `
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
`

const { error } = await supabase.rpc('exec_sql', { query: sql }).catch(() => ({ error: 'rpc not available' }))
if (error) {
  // Fallback: try creating tables individually via insert (tables won't exist but we'll get clear errors)
  console.log('RPC exec_sql not available. Run this SQL manually in Supabase SQL editor:\n')
  console.log(sql)
} else {
  console.log('Tables created successfully.')
}
