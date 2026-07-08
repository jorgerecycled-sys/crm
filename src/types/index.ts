export type UserRole = 'Super Admin' | 'Admin' | 'Manager' | 'Empleado'
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type LeadStatus = 'NEW' | 'CONTACTED' | 'INTERESTED' | 'NEGOTIATING' | 'CLOSED' | 'LOST'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type SaleStage = 'NEW' | 'CONTACTED' | 'INTERESTED' | 'OFFER' | 'CLOSED' | 'LOST'
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
export type IncidentCategory = 'TECHNICAL' | 'COMMERCIAL' | 'CLIENT' | 'ADMINISTRATION' | 'OTHER'
export type IncidentStatus = 'OPEN' | 'REVIEWING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type FollowupStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED'

export interface AuthUser {
  sub: string
  email: string
  roleId: string
  roleName: string
}

export interface CrmChannel {
  id: string
  name: string
  slug: string
  icon: string
  color: string
  active: boolean
  sortOrder: number
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  roleId: string
  role: { id: string; name: string }
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
  channelAccess?: { channelId: string; channel: CrmChannel }[]
}

export interface Lead {
  id: string
  name: string
  username: string | null
  channelId: string
  channel?: CrmChannel
  status: LeadStatus
  priority: Priority
  assignedToId: string | null
  assignedTo?: { id: string; firstName: string; lastName: string }
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Conversation {
  id: string
  leadId: string
  lead?: Lead
  channelId: string
  message: string
  direction: 'INBOUND' | 'OUTBOUND'
  responsibleId: string
  responsible?: { id: string; firstName: string; lastName: string }
  createdAt: string
}

export interface Followup {
  id: string
  leadId: string
  lead?: Lead
  channelId: string
  scheduledAt: string
  responsibleId: string
  responsible?: { id: string; firstName: string; lastName: string }
  status: FollowupStatus
  notes: string | null
  createdAt: string
}

export interface Sale {
  id: string
  leadId: string
  lead?: Lead
  channelId: string
  title: string
  amount: number | null
  stage: SaleStage
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  channelId: string | null
  channel?: CrmChannel
  assignedToId: string | null
  assignedTo?: { id: string; firstName: string; lastName: string }
  priority: Priority
  dueDate: string | null
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

export interface Incident {
  id: string
  title: string
  description: string
  category: IncidentCategory
  priority: Priority
  status: IncidentStatus
  reportedById: string
  reportedBy?: { id: string; firstName: string; lastName: string; email: string }
  attachments?: unknown
  createdAt: string
  updatedAt: string
  comments?: IncidentComment[]
}

export interface IncidentComment {
  id: string
  incidentId: string
  userId: string
  user?: { id: string; firstName: string; lastName: string }
  content: string
  createdAt: string
}

export interface DashboardStats {
  activeUsers: number
  newLeads: number
  monthlySales: number
  conversations: number
  openIncidents: number
  recentActivity: ActivityLog[]
}

export interface ActivityLog {
  id: string
  userId: string | null
  user?: { firstName: string; lastName: string }
  action: string
  resource: string
  resourceId: string | null
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
