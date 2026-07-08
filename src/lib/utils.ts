import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

export const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  CONTACTED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  INTERESTED: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  NEGOTIATING: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CLOSED: 'bg-green-500/10 text-green-400 border-green-500/20',
  LOST: 'bg-red-500/10 text-red-400 border-red-500/20',
  OPEN: 'bg-red-500/10 text-red-400 border-red-500/20',
  REVIEWING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  RESOLVED: 'bg-green-500/10 text-green-400 border-green-500/20',
  ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/20',
  INACTIVE: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  SUSPENDED: 'bg-red-500/10 text-red-400 border-red-500/20',
  TODO: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  DONE: 'bg-green-500/10 text-green-400 border-green-500/20',
  CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/20',
  PENDING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  COMPLETED: 'bg-green-500/10 text-green-400 border-green-500/20',
  OFFER: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
}

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-500/10 text-gray-400',
  MEDIUM: 'bg-blue-500/10 text-blue-400',
  HIGH: 'bg-orange-500/10 text-orange-400',
  CRITICAL: 'bg-red-500/10 text-red-400',
}

export const STATUS_LABELS: Record<string, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  INTERESTED: 'Interesado',
  NEGOTIATING: 'Negociación',
  CLOSED: 'Cerrado',
  LOST: 'Perdido',
  OPEN: 'Abierta',
  REVIEWING: 'En revisión',
  IN_PROGRESS: 'En proceso',
  RESOLVED: 'Resuelta',
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
  TODO: 'Por hacer',
  DONE: 'Completada',
  CANCELLED: 'Cancelada',
  PENDING: 'Pendiente',
  COMPLETED: 'Completado',
  OFFER: 'Oferta',
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
}
