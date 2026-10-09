import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    if (!environment.supabaseUrl || !environment.supabasePublishableKey) {
      throw new Error('Supabase configuration is missing.');
    }

    this.client = createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
}
