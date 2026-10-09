import { MembershipStatus } from '../../core/models/app.models';

export interface ManagedUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url?: string | null;
  role: 'admin' | 'member';
  enabled: boolean;
  created_at: string;
}

export interface Membership {
  room_id: string;
  user_id: string;
  status: MembershipStatus;
}

export type RequestKind = 'join' | 'leave' | 'delete_account';
export interface UserRequest {
  id: string;
  user_id: string | null;
  room_id: string | null;
  kind: RequestKind;
  status: 'pending' | 'processing' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
}

export const requestLabels: Record<RequestKind, string> = {
  join: 'Acceso a sala',
  leave: 'Salida de sala',
  delete_account: 'Baja de cuenta',
};
export const requestStatusLabels = {
  pending: 'Pendiente',
  processing: 'Procesando',
  approved: 'Aprobada',
  rejected: 'Denegada',
};
export const membershipLabels: Record<MembershipStatus, string> = {
  pending: 'Pendiente',
  active: 'Con acceso',
  rejected: 'Denegado',
  leave_requested: 'Salida solicitada',
  revoked: 'Revocado',
};
