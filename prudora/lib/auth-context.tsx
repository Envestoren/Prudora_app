import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';
import { registerForExpoPushTokenAsync } from '@/lib/push-notifications';

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
  deleteAccount: () => Promise<{ error: Error | null }>;
  appMode: 'user' | 'admin';
  setAppMode: (mode: 'user' | 'admin') => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const APP_MODE_STORAGE_KEY = 'prudora_app_mode';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    isLoading: true,
    isConfirmed: false,
  });
  const [appMode, setAppModeState] = useState<'user' | 'admin'>('user');
  const lastSeenAlertEventIdRef = useRef<string | null>(null);

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
      const nextSession = data.session;
      if (nextSession) {
        const profile = await fetchProfile(nextSession.user.id);
        const confirmed = nextSession.user.email_confirmed_at != null;
        setState((s) => ({
          ...s,
          session: nextSession,
          user: nextSession.user,
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

  const syncExpoPushToken = useCallback(async (userId: string) => {
    try {
      const token = await registerForExpoPushTokenAsync();
      if (!token) return;
      await supabase
        .from('user_push_tokens')
        .upsert(
          {
            user_id: userId,
            expo_push_token: token,
            platform: 'expo',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'expo_push_token' }
        );
    } catch {
      // Ignore push registration errors; auth flow should not fail.
    }
  }, []);

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

  useEffect(() => {
    if (!state.user?.id) return;
    void syncExpoPushToken(state.user.id);
  }, [state.user?.id, syncExpoPushToken]);

  const sendLocalPriceAlertNotification = useCallback(async (title: string, body: string) => {
    Alert.alert(title, body);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(APP_MODE_STORAGE_KEY);
        if (cancelled) return;
        if (saved === 'admin' || saved === 'user') {
          setAppModeState(saved);
        } else {
          setAppModeState('user');
        }
      } catch {
        if (!cancelled) setAppModeState('user');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state.profile?.is_admin && appMode === 'admin') {
      setAppModeState('user');
      void AsyncStorage.setItem(APP_MODE_STORAGE_KEY, 'user');
    }
  }, [state.profile?.is_admin, appMode]);

  // Expo Go fallback: vis lokalt varsel ved nye prisvarsel-events.
  useEffect(() => {
    const userId = state.user?.id;
    if (!userId) return;
    const isExpoGo =
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === 'storeClient';
    if (!isExpoGo) return;

    let cancelled = false;
    const run = async () => {
      const { data, error } = await supabase
        .from('user_price_alert_events')
        .select('id, product_id, store_id, product_price_id, sent_at')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || error || !data?.id) return;

      const eventId = data.id as string;
      if (!lastSeenAlertEventIdRef.current) {
        lastSeenAlertEventIdRef.current = eventId;
        return;
      }
      if (lastSeenAlertEventIdRef.current === eventId) return;
      lastSeenAlertEventIdRef.current = eventId;

      const [{ data: productData }, { data: storeData }, { data: newPriceData }] = await Promise.all([
        supabase.from('products').select('name').eq('id', data.product_id).maybeSingle(),
        supabase.from('stores').select('chain, name').eq('id', data.store_id).maybeSingle(),
        supabase
          .from('product_prices')
          .select('id, product_id, store_id, price_amount, recorded_at')
          .eq('id', data.product_price_id)
          .maybeSingle(),
      ]);

      if (cancelled || !newPriceData) return;

      const { data: prevPriceData } = await supabase
        .from('product_prices')
        .select('price_amount, recorded_at')
        .eq('product_id', newPriceData.product_id)
        .eq('store_id', newPriceData.store_id)
        .lt('recorded_at', newPriceData.recorded_at)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newPrice = Number((newPriceData as any).price_amount);
      const oldPrice = Number((prevPriceData as any)?.price_amount);
      const hasOld = Number.isFinite(oldPrice);
      const deltaPct = hasOld && oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : null;

      const productName = (productData as any)?.name ?? 'Produkt';
      const storeLabel = (storeData as any)?.name
        ? `${(storeData as any).chain} - ${(storeData as any).name}`
        : ((storeData as any)?.chain ?? 'Butikk');
      const summary = hasOld
        ? `${oldPrice.toFixed(2)} kr -> ${newPrice.toFixed(2)} kr (${deltaPct != null ? `${deltaPct.toFixed(1)}%` : ''})`
        : `${newPrice.toFixed(2)} kr`;

      await sendLocalPriceAlertNotification(
        'Prudora Prisvarsel',
        `${productName}\n${storeLabel}\n${summary}`
      );
    };

    void run();
    const timer = setInterval(() => {
      void run();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sendLocalPriceAlertNotification, state.user?.id]);

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
        const session = state.session ?? (await supabase.auth.getSession()).data.session;
        if (!session?.access_token) {
          return { error: new Error('Ikke innlogget. Logg inn på nytt og prøv igjen.') };
        }

        // Kall Supabase Auth REST API direkte for å unngå at JS-klientens
        // interne onAuthStateChange-listener blokkerer updateUser-promisen.
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

        const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ password: params.newPassword }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = (body as any)?.msg ?? (body as any)?.message ?? (body as any)?.error_description ?? 'Kunne ikke oppdatere passord.';
          return { error: new Error(msg) };
        }

        return { error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ukjent feil';
        return { error: new Error(msg) };
      }
    },
    [state.session]
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

  const deleteAccount = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('delete_my_account_preserve_prices');
      if (error) return { error };
      await supabase.auth.signOut();
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ukjent feil ved sletting av konto.';
      return { error: new Error(msg) };
    }
  }, []);

  const setAppMode = useCallback(async (mode: 'user' | 'admin') => {
    setAppModeState(mode);
    try {
      await AsyncStorage.setItem(APP_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore local persistence errors
    }
  }, []);

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
    deleteAccount,
    appMode,
    setAppMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
