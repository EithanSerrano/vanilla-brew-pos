import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { Lexend_400Regular, Lexend_700Bold, useFonts } from '@expo-google-fonts/lexend';
import { Ionicons } from '@expo/vector-icons';

import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useAuth } from '../constants/AuthContext';
import { canManageOrders } from '../constants/roles';
import { useAppTheme } from '../constants/ThemeContext';
import { Colors } from '../constants/theme';
import { db } from '../firebaseConfig';

const HISTORY_LIMIT = 50;

const formatDuration = (ms) => {
  const totalMin = Math.max(Math.floor(ms / 60000), 0);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatTime = (date) =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const formatDay = (date) =>
  date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function TimeClockScreen() {
  const router = useRouter();
  const { user, profile, role } = useAuth();
  const canViewAll = canManageOrders(role);
  const { appTheme } = useAppTheme();
  const colors = Colors[appTheme] || Colors.light;
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [fontsLoaded] = useFonts({ Lexend_400Regular, Lexend_700Bold });
  const [entries, setEntries] = useState([]);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user?.uid || !role) return;
    // Managers/admins see every employee's log; employees only their own.
    // Sorted here, so no composite Firestore index is needed.
    const q = canViewAll
      ? collection(db, 'timeclock')
      : query(collection(db, 'timeclock'), where('uid', '==', user.uid));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              uid: data.uid,
              name: data.name || 'Unknown',
              clockIn: data.clockIn?.toDate?.() ?? null,
              clockOut: data.clockOut?.toDate?.() ?? null,
            };
          })
          .filter((r) => r.clockIn)
          .sort((a, b) => b.clockIn - a.clockIn);
        setEntries(rows);
      },
      (error) => console.error('Error loading time clock: ', error)
    );
  }, [user?.uid, role, canViewAll]);

  const openEntry = entries.find((e) => e.uid === user?.uid && !e.clockOut) || null;
  const history = entries.slice(0, HISTORY_LIMIT);

  const handleToggle = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (openEntry) {
        await updateDoc(doc(db, 'timeclock', openEntry.id), { clockOut: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'timeclock'), {
          uid: user.uid,
          name: profile?.name || user.email || '',
          clockIn: serverTimestamp(),
          clockOut: null,
        });
      }
    } catch (error) {
      console.error('Time clock error: ', error);
      Alert.alert('Clock In', 'Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!fontsLoaded) return null;

  const isClockedIn = !!openEntry;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}>
          <Ionicons name="arrow-back" size={26} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clock In</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.employeeName}>{profile?.name || user?.email}</Text>
          <Text style={styles.statusLabel}>
            {isClockedIn ? `Clocked in since ${formatTime(openEntry.clockIn)}` : 'Not clocked in'}
          </Text>
          <Text style={styles.nowText}>{formatDay(now)} · {formatTime(now)}</Text>

          <TouchableOpacity
            style={[styles.mainButton, isClockedIn && styles.mainButtonOut, busy && { opacity: 0.6 }]}
            onPress={handleToggle}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Ionicons name={isClockedIn ? 'stop-circle-outline' : 'play-circle-outline'} size={32} color="#FFFFFF" />
            <Text style={styles.mainButtonText}>{isClockedIn ? 'Clock Out' : 'Clock In'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>{canViewAll ? 'Attendance log' : 'My attendance log'}</Text>
        {history.length === 0 ? (
          <Text style={styles.empty}>No entries yet.</Text>
        ) : (
          history.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{e.name}</Text>
                <Text style={styles.rowDay}>{formatDay(e.clockIn)}</Text>
                <Text style={styles.rowRange}>
                  In {formatTime(e.clockIn)} · Out {e.clockOut ? formatTime(e.clockOut) : '—'}
                </Text>
              </View>
              <Text style={[styles.rowDuration, !e.clockOut && styles.rowActive]}>
                {e.clockOut ? formatDuration(e.clockOut - e.clockIn) : 'On shift'}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.containerBg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 18,
      backgroundColor: colors.headerBg,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 80 },
    backText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Lexend_400Regular' },
    headerTitle: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Lexend_700Bold' },

    content: { padding: 20, gap: 12, alignItems: 'center' },
    card: {
      width: '100%',
      maxWidth: 560,
      backgroundColor: colors.cardBg,
      borderRadius: 28,
      padding: 28,
      alignItems: 'center',
      gap: 10,
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
    },
    statusLabel: { color: colors.textSub, fontSize: 16, fontFamily: 'Lexend_400Regular' },
    employeeName: { color: colors.textMain, fontSize: 28, fontFamily: 'Lexend_700Bold' },
    nowText: { color: colors.textSub, fontSize: 14, fontFamily: 'Lexend_400Regular' },
    mainButton: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      alignSelf: 'stretch',
      paddingVertical: 18,
      borderRadius: 18,
      backgroundColor: '#0A5A3A',
    },
    mainButtonOut: { backgroundColor: '#C0392B' },
    mainButtonText: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Lexend_700Bold' },

    sectionTitle: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 560,
      marginTop: 12,
      color: '#FFFFFF',
      fontSize: 18,
      fontFamily: 'Lexend_700Bold',
    },
    empty: { color: '#E0D6D1', fontSize: 14, fontFamily: 'Lexend_400Regular' },
    row: {
      width: '100%',
      maxWidth: 560,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBg,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 18,
    },
    rowName: { color: colors.textMain, fontSize: 18, fontFamily: 'Lexend_700Bold' },
    rowDay: { color: colors.textSub, fontSize: 14, fontFamily: 'Lexend_400Regular', marginTop: 2 },
    rowRange: { color: colors.textSub, fontSize: 14, fontFamily: 'Lexend_400Regular', marginTop: 2 },
    rowDuration: { color: colors.textMain, fontSize: 16, fontFamily: 'Lexend_700Bold' },
    rowActive: { color: '#0A5A3A' },
  });
