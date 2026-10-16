import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../constants/AuthContext';
import { getHomeRoute } from '../constants/roles';

// Wrap a screen (or part of one) to restrict it to certain roles:
//   <RoleGuard allow={[ROLES.ADMIN, ROLES.MANAGER]}>...</RoleGuard>
// Signed-out users go to login; signed-in users without access go to their home.
// Pass `fallback` to render something in place of redirecting.
export default function RoleGuard({ allow, children, fallback }) {
  const { user, role, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (hasRole(allow)) return children;
  if (fallback !== undefined) return fallback;
  return <Redirect href={getHomeRoute(role)} />;
}
