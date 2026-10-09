export type AppRole = 'admin' | 'member';
export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'leave_requested' | 'revoked';

export interface ApiResponse<T> {
  result: T;
  message: string;
  description: string;
  statusCode: number;
  ok: boolean;
}

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: AppRole;
}
