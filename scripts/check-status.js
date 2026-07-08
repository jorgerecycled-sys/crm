const { createClient } = require('@supabase/supabase-js')
const supabase = createClient('https://lzhzuqmctlkgpxkhkqgt.supabase.co', 'sb_publishable_5D04cRAb7kReLSEoG8C-vw_-WUwUOD3', { auth: { persistSession: false } })
async function main() {
  const { data } = await supabase.from('ig_accounts').select('status').range(0, 1999)
  const counts = {}
  for (const a of data || []) counts[a.status] = (counts[a.status] || 0) + 1
  console.log('Status breakdown:', counts)
  console.log('Total:', Object.values(counts).reduce((a,b)=>a+b,0))
}
main().catch(console.error)
