const { createClient } = require('@supabase/supabase-js')
const supabase = createClient('https://lzhzuqmctlkgpxkhkqgt.supabase.co', 'sb_publishable_5D04cRAb7kReLSEoG8C-vw_-WUwUOD3', { auth: { persistSession: false } })
async function main() {
  const cols = ['igPassword','igGroup','niche','accountType','igEmail','fa2']
  for (const col of cols) {
    const { error } = await supabase.from('ig_accounts').select(col).limit(1)
    console.log(col + ':', error?.code === '42703' ? '❌ NO existe' : '✓ existe')
  }
}
main().catch(console.error)
