import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isConfirmed: boolean;
};

type AuthContextValue = AuthState & {
  signUp: (params: { email: string; password: string; firstName: string; lastName: string; age: number }) => Promise<{ error: Error | null; emailAlreadyRegistered?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string, redirectTo?: string) => Promise<{ error: Error | null }>;
  changePassword: (params: { currentPassword: string; newPassword: string }) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  updateProfile: (params: { first_name: string; last_name: string; age: number }) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    isLoading: true,
    isConfirmed: false,
  });

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, first_name, last_name, age, is_admin, is_price_verified, price_verification_requested_at, created_at, updated_at'
      )
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data as Profile;
  }, []);

  const isInvalidRefreshTokenError = useCallback((err: unknown) => {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err && 'message' in err
          ? String((err as any).message)
          : '';
    const lower = msg.toLowerCase();
    return (
      lower.includes('invalid refresh token') ||
      lower.includes('refresh token not found') ||
      lower.includes('refresh_token_not_found')
    );
  }, []);

  const refreshProfile = useCallback(async () => {
    const user = state.user ?? (await supabase.auth.getUser()).data.user;
    if (!user) {
      setState((s) => ({ ...s, profile: null }));
      return;
    }
    const profile = await fetchProfile(user.id);
    setState((s) => ({ ...s, profile }));
  }, [state.user, fetchProfile]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          await supabase.auth.signOut();
          setState((s) => ({
            ...s,
            session: null,
            user: null,
            profile: null,
            isConfirmed: false,
          }));
        }
        return false;
      }
      if (data.session) {
        const profile = await fetchProfile(data.session.user.id);
        const confirmed = data.session.user.email_confirmed_at != null;
        setState((s) => ({
          ...s,
          session: data.session,
          user: data.session.user,
          profile,
          isConfirmed: confirmed,
        }));
        return confirmed;
      }
      return false;
    } catch (e) {
      if (isInvalidRefreshTokenError(e)) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setState((s) => ({
          ...s,
          session: null,
          user: null,
          profile: null,
          isConfirmed: false,
        }));
      }
      return false;
    }
  }, [fetchProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            await supabase.auth.signOut();
          }
          setState((s) => ({
            ...s,
            session: null,
            user: null,
            profile: null,
            isLoading: false,
            isConfirmed: false,
          }));
          return;
        }
        const session = data.session ?? null;
        const user = session?.user ?? null;
        let profile: Profile | null = null;
        if (user) profile = await fetchProfile(user.id);
        if (cancelled) return;
        setState({
          session,
          user,
          profile,
          isLoading: false,
          isConfirmed: user?.email_confirmed_at != null,
        });
      } catch (e) {
        if (cancelled) return;
        if (isInvalidRefreshTokenError(e)) {
          try {
            await supabase.auth.signOut();
          } catch {
            // ignore
          }
        }
        setState((s) => ({
          ...s,
          session: null,
          user: null,
          profile: null,
          isLoading: false,
          isConfirmed: false,
        }));
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      let profile: Profile | null = null;
      if (user) profile = await fetchProfile(user.id);
      setState({
        session,
        user,
        profile,
        isLoading: false,
        isConfirmed: user?.email_confirmed_at != null,
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchProfile, isInvalidRefreshTokenError]);

  const signUp = useCallback(
    async (params: { email: string; password: string; firstName: string; lastName: string; age: number }) => {
      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: { first_name: params.firstName, last_name: params.lastName, age: params.age },
        },
      });
      if (error) {
        const msg = error.message?.toLowerCase() ?? '';
        const emailAlreadyRegistered =
          msg.includes('already registered') || msg.includes('already exists') || msg.includes('already in use');
        return { error, emailAlreadyRegistered };
      }
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: null, emailAlreadyRegistered: true };
      }
      return { error: null };
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string, redirectTo?: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirectTo ?? 'prudora://update-password',
    });
    return { error: error ?? null };
  }, []);

  const changePassword = useCallback(
    async (params: { currentPassword: string; newPassword: string }) => {
      try {
        const user = state.user ?? (await supabase.auth.getUser()).data.user;
        const email = user?.email ?? null;
        if (!user || !email) {
          return { error: new Error('Kunne ikke finne brukerens e-post. Logg inn på nytt og prøv igjen.') };
        }

        // Verifiser nåværende passord "silent" uten å påvirke app-sesjonen.
        // Vi bruker en midlertidig klient uten persist/refresh for å unngå auth-lock og reauth-epost.
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
        if (!supabaseUrl || !supabaseAnonKey) {
          return { error: new Error('Mangler Supabase-konfig (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).') };
        }

        const noopStorage = {
          getItem: async () => null,
          setItem: async () => {},
          removeItem: async () => {},
        };

        const verifier = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            storage: noopStorage,
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { error: verifyError } = await verifier.auth.signInWithPassword({
          email,
          password: params.currentPassword,
        });

        if (verifyError) {
          const msg = verifyError.message?.toLowerCase?.() ?? '';
          const status = (verifyError as unknown as { status?: number }).status;
          if (status === 400 && (msg.includes('invalid login') || msg.includes('invalid credentials'))) {
            return { error: new Error('Nåværende passord er feil.') };
          }
          return { error: verifyError };
        }

        const { error: updateError } = await supabase.auth.updateUser({ password: params.newPassword });
        return { error: updateError ?? null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ukjent feil';
        return { error: new Error(msg) };
      }
    },
    [state.user]
  );

  const updateProfile = useCallback(
    async (params: { first_name: string; last_name: string; age: number }) => {
      const user = state.user ?? (await supabase.auth.getUser()).data.user;
      if (!user) return { error: new Error('Ikke innlogget') };
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: params.first_name,
          last_name: params.last_name,
          age: params.age,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (!error) await refreshProfile();
      return { error: error ?? null };
    },
    [state.user, refreshProfile]
  );

  const value: AuthContextValue = {
    ...state,
    signUp,
    signIn,
    signOut,
    resetPasswordForEmail,
    changePassword,
    refreshProfile,
    refreshSession,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
