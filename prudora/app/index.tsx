import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth-context';

export default function IndexScreen() {
  const { session, isLoading, isConfirmed } = useAuth();

  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!isConfirmed) return <Redirect href="/(auth)/bekreft-epost" />;
  return <Redirect href="/(tabs)" />;
}
