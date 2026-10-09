import { Injectable, computed, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { Profile } from '../models/app.models';
import { SupabaseService } from '../services/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly sessionState = signal<Session | null>(null);
  private readonly profileState = signal<Profile | null>(null);
  private readonly initializedState = signal(false);
  private initializing: Promise<void> | null = null;

  readonly profile = this.profileState.asReadonly();
  readonly initialized = this.initializedState.asReadonly();
  readonly user = computed<User | null>(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.profileState()?.role === 'admin');

  constructor(private readonly supabase: SupabaseService) {}

  async initialize(): Promise<void> {
    if (this.initializedState()) return;
    this.initializing ??= this.initializeSession();
    return this.initializing;
  }

  private async initializeSession(): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    await this.applySession(data.session);
    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void this.applySession(session), 0);
    });
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw error;
    this.profileState.set(null);
    this.sessionState.set(null);
  }

  async refreshProfile(): Promise<void> {
    const user = this.user();
    if (user) await this.loadProfile(user.id);
  }

  private async applySession(session: Session | null): Promise<void> {
    const sameUser = this.sessionState()?.user.id === session?.user.id;
    this.sessionState.set(session);
    if (!sameUser || !session) this.profileState.set(null);
    if (session) await this.loadProfile(session.user.id);
    this.initializedState.set(true);
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('id, email, display_name, avatar_url, role')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data || this.user()?.id !== userId) return;
    this.profileState.set({
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      role: data.role,
    });
  }
}
