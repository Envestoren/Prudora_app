import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
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
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  updateProfile: (params: { first_name: string; last_name: string; age: number }) => Promise<{ error: Error | null }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
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
      .select('id, first_name, last_name, age, is_admin, created_at, updated_at')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data as Profile;
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
    const { data } = await supabase.auth.refreshSession();
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
  }, [fetchProfile]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
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

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

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

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'prudora://reset-password',
    });
    return { error: error ?? null };
  }, []);

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

  const updatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const user = state.user ?? (await supabase.auth.getUser()).data.user;
      if (!user?.email) return { error: new Error('Ikke innlogget') };
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) return { error: signInError };
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      return { error: updateError ?? null };
    },
    [state.user]
  );

  const value: AuthContextValue = {
    ...state,
    signUp,
    signIn,
    signOut,
    resetPasswordForEmail,
    refreshProfile,
    refreshSession,
    updateProfile,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
