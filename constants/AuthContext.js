import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { auth, db } from '../firebaseConfig';
import { ROLES, hasRole, normalizeRole } from './roles';

const AuthContext = createContext({
  user: null,
  profile: null,
  role: null,
  loading: true,
  isAdmin: false,
  isManager: false,
  isEmployee: false,
  hasRole: () => false,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Live-subscribe so role/status changes made by an admin apply immediately.
      unsubscribeProfile = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snap) => {
          setProfile(snap.exists() ? snap.data() : null);
          setLoading(false);
        },
        (error) => {
          console.error('Could not load user profile:', error);
          setProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const value = useMemo(() => {
    const role = user ? normalizeRole(profile?.role) : null;
    return {
      user,
      profile,
      role,
      loading,
      isAdmin: role === ROLES.ADMIN,
      isManager: role === ROLES.MANAGER,
      isEmployee: role === ROLES.EMPLOYEE,
      hasRole: (allowed) => (role ? hasRole(role, allowed) : false),
    };
  }, [user, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
