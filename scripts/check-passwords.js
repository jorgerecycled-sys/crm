const { createClient } = require('@supabase/supabase-js')
const supabase = createClient('https://lzhzuqmctlkgpxkhkqgt.supabase.co', 'sb_publishable_5D04cRAb7kReLSEoG8C-vw_-WUwUOD3', { auth: { persistSession: false } })

async function main() {
  const { data, error } = await supabase
    .from('ig_accounts')
    .select('username, igPassword, igEmail, fa2')
    .order('username')
    .limit(200)

  if (error) { console.error('Error:', error.message); return }

  const withPwd   = data.filter(a => a.igPassword)
  const withEmail = data.filter(a => a.igEmail)
  const withFa2   = data.filter(a => a.fa2)

  console.log(`Total cuentas: ${data.length}`)
  console.log(`Con contraseña: ${withPwd.length}`)
  console.log(`Con email: ${withEmail.length}`)
  console.log(`Con 2FA: ${withFa2.length}`)
  console.log('')
  console.log('Primeras 10 con contraseña:')
  withPwd.slice(0, 10).forEach(a => console.log(`  @${a.username} → pwd: ${a.igPassword?.slice(0,4)}***`))
  console.log('')
  console.log('Sin contraseña:')
  data.filter(a => !a.igPassword).slice(0, 10).forEach(a => console.log(`  @${a.username}`))
}
main().catch(console.error)
