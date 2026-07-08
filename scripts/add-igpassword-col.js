// Adds igPassword column to ig_accounts if it doesn't exist
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient('https://lzhzuqmctlkgpxkhkqgt.supabase.co', 'sb_publishable_5D04cRAb7kReLSEoG8C-vw_-WUwUOD3', { auth: { persistSession: false } })
async function main() {
  // Try to read igPassword from any row — if column doesn't exist, it'll error with code 42703
  const { error } = await supabase.from('ig_accounts').select('igPassword').limit(1)
  if (error?.code === '42703') {
    console.log('Column igPassword does NOT exist — needs migration')
    console.log('\nRun this SQL in Supabase dashboard → SQL Editor:')
    console.log('ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS "igPassword" TEXT;')
  } else if (error) {
    console.log('Other error:', error.message)
  } else {
    console.log('Column igPassword already EXISTS ✓')
  }
}
main().catch(console.error)
