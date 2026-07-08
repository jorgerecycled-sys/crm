import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const permissions = [
    { name: 'users:read', resource: 'users', action: 'read' },
    { name: 'users:write', resource: 'users', action: 'write' },
    { name: 'users:delete', resource: 'users', action: 'delete' },
    { name: 'crm:read', resource: 'crm', action: 'read' },
    { name: 'crm:write', resource: 'crm', action: 'write' },
    { name: 'crm:delete', resource: 'crm', action: 'delete' },
    { name: 'incidents:read', resource: 'incidents', action: 'read' },
    { name: 'incidents:write', resource: 'incidents', action: 'write' },
    { name: 'incidents:manage', resource: 'incidents', action: 'manage' },
    { name: 'admin:read', resource: 'admin', action: 'read' },
    { name: 'admin:write', resource: 'admin', action: 'write' },
    { name: 'channels:manage', resource: 'channels', action: 'manage' },
    { name: 'reports:read', resource: 'reports', action: 'read' },
  ]

  const createdPerms = await Promise.all(
    permissions.map(p => prisma.permission.upsert({ where: { name: p.name }, update: {}, create: p }))
  )
  const permMap = Object.fromEntries(createdPerms.map(p => [p.name, p.id]))

  const superAdminRole = await prisma.role.upsert({ where: { name: 'Super Admin' }, update: {}, create: { name: 'Super Admin', description: 'Full access' } })
  const adminRole = await prisma.role.upsert({ where: { name: 'Admin' }, update: {}, create: { name: 'Admin', description: 'Admin access' } })
  const managerRole = await prisma.role.upsert({ where: { name: 'Manager' }, update: {}, create: { name: 'Manager', description: 'Manager access' } })
  const employeeRole = await prisma.role.upsert({ where: { name: 'Empleado' }, update: {}, create: { name: 'Empleado', description: 'Basic access' } })

  const rolePerms: Record<string, string[]> = {
    [superAdminRole.id]: Object.values(permMap),
    [adminRole.id]: ['users:read','users:write','crm:read','crm:write','crm:delete','incidents:read','incidents:write','incidents:manage','admin:read','admin:write','channels:manage','reports:read'].map(n => permMap[n]),
    [managerRole.id]: ['users:read','crm:read','crm:write','incidents:read','incidents:write','incidents:manage','reports:read'].map(n => permMap[n]),
    [employeeRole.id]: ['crm:read','crm:write','incidents:read','incidents:write'].map(n => permMap[n]),
  }

  for (const [roleId, permIds] of Object.entries(rolePerms)) {
    await Promise.all(
      permIds.filter(Boolean).map(permissionId =>
        prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId } }, update: {}, create: { roleId, permissionId } })
      )
    )
  }

  const channels = [
    { name: 'Instagram', slug: 'instagram', icon: 'instagram', color: '#E1306C', sortOrder: 1 },
    { name: 'Reddit', slug: 'reddit', icon: 'reddit', color: '#FF4500', sortOrder: 2 },
    { name: 'Telegram', slug: 'telegram', icon: 'send', color: '#0088CC', sortOrder: 3, active: false },
    { name: 'Discord', slug: 'discord', icon: 'message-circle', color: '#5865F2', sortOrder: 4, active: false },
    { name: 'WhatsApp', slug: 'whatsapp', icon: 'phone', color: '#25D366', sortOrder: 5, active: false },
    { name: 'TikTok', slug: 'tiktok', icon: 'music', color: '#000000', sortOrder: 6, active: false },
    { name: 'X', slug: 'x', icon: 'twitter', color: '#000000', sortOrder: 7, active: false },
  ]

  const createdChannels = await Promise.all(
    channels.map(c => prisma.crmChannel.upsert({ where: { slug: c.slug }, update: {}, create: c }))
  )
  const igChannel = createdChannels.find(c => c.slug === 'instagram')!

  const passwordHash = await bcrypt.hash('Admin1234!', 12)

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@erp.local' },
    update: {},
    create: { email: 'superadmin@erp.local', passwordHash, firstName: 'Super', lastName: 'Admin', roleId: superAdminRole.id },
  })
  const admin = await prisma.user.upsert({
    where: { email: 'admin@erp.local' },
    update: {},
    create: { email: 'admin@erp.local', passwordHash, firstName: 'Admin', lastName: 'User', roleId: adminRole.id },
  })

  // Grant all channels to superAdmin, Instagram to admin
  await Promise.all([
    ...createdChannels.map(c =>
      prisma.userChannelAccess.upsert({ where: { userId_channelId: { userId: superAdmin.id, channelId: c.id } }, update: {}, create: { userId: superAdmin.id, channelId: c.id } })
    ),
    prisma.userChannelAccess.upsert({ where: { userId_channelId: { userId: admin.id, channelId: igChannel.id } }, update: {}, create: { userId: admin.id, channelId: igChannel.id } }),
  ])

  console.log('Seed complete.')
  console.log('Login: superadmin@erp.local / Admin1234!')
  console.log('Login: admin@erp.local / Admin1234!')
}

main().catch(console.error).finally(() => prisma.$disconnect())
