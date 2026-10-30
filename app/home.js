import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';

import {
  Lexend_400Regular,
  Lexend_700Bold,
  Lexend_900Black,
  useFonts
} from '@expo-google-fonts/lexend';
import { Ionicons } from '@expo/vector-icons';

import { signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { Colors } from '../constants/theme';
import { useAuth } from '../constants/AuthContext';
import { canSeeOrder } from '../constants/roles';
import { useAppTheme } from '../constants/ThemeContext'; // ← shared theme
import { auth, db } from '../firebaseConfig';

export default function HomeScreen() {
  const router = useRouter();

  // --- THEME LOGIC (now shared across all screens) ---
  const { user: authUser, profile, role } = useAuth();
  const { appTheme } = useAppTheme();
  const theme = appTheme; // 'light' | 'dark'
  const currentColors = Colors[theme];

  const [logoutVisible, setLogoutVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const minDim = Math.min(width, height);
  const isMobile = minDim < 768;
  const isTablet = minDim >= 768 && minDim < 1024;

  let scaleRatio = Math.min(width / 1180, height / 800, 1);

  if (isMobile) {
    scaleRatio = isLandscape ? Math.min(height / 650, 0.65) : Math.max(scaleRatio, 0.75);
  } else if (isTablet) {
    scaleRatio = isLandscape ? Math.min(height / 800, 0.8) : Math.max(scaleRatio, 0.9);
  }

  if (isMobile && !isLandscape) {
    scaleRatio = Math.min(scaleRatio, 0.55);
  }

  if (height < 500) {
    scaleRatio = Math.min(scaleRatio, 0.5);
  } else if (height < 600) {
    scaleRatio = Math.min(scaleRatio, 0.65);
  }

  const s = (size) => Math.max(Math.round(size * scaleRatio), 1);
  const styles = useMemo(
    () => getStyles(s, isMobile, width, isLandscape, currentColors, theme),
    [width, height, isMobile, isLandscape, currentColors, theme]
  );

  let [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_700Bold,
    Lexend_900Black,
  });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 8, useNativeDriver: true }),
    ]).start();

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'salestransaction'), where('status', '==', 'Ongoing'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) =>
        setPendingCount(
          snapshot.docs.filter((d) => canSeeOrder(role, d.data(), authUser?.uid, profile?.name)).length
        ),
      (error) => console.error('Error fetching pending orders: ', error)
    );
    return () => unsubscribe();
  }, [role, authUser?.uid, profile?.name]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        if (userData?.status?.toLowerCase() === 'inactive') {
          const userDocRef = doc(db, 'users', user.uid);
          updateDoc(userDocRef, { isOnline: false }).finally(() => {
            signOut(auth).then(() => {
              Alert.alert('Session Terminated', 'Your account has been disabled by the Administrator.');
              router.replace('/');
            });
          });
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={currentColors.textMain} />
      </View>
    );
  }

  const handleConfirmLogout = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { isOnline: false, lastLogin: new Date() });
        await signOut(auth);
      }
      setLogoutVisible(false);
      router.replace('/');
    } catch (error) {
      console.error('Error during logout: ', error);
      setLogoutVisible(false);
      router.replace('/');
    }
  };

  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" hidden={true} />

      <Modal animationType="fade" transparent={true} visible={logoutVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Log Out?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to{'\n'}
              <Text style={styles.bold}>Log Out?</Text>
            </Text>

            <View style={styles.buttonGroupRow}>
              <TouchableOpacity style={styles.buttonReturn} onPress={() => setLogoutVisible(false)}>
                <Text style={styles.buttonReturnText}>Return</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonConfirm} onPress={handleConfirmLogout}>
                <Text style={styles.buttonConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../assets/images/company-logo.png')}
            style={[styles.logoCompany, { tintColor: '#FFFFFF' }]}
            resizeMode="contain"
          />
          <Image
            source={require('../assets/images/sms-logo.png')}
            style={[styles.logoSms, { tintColor: '#FFFFFF' }]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerRight}>
          <View style={styles.dateTimeContainer}>
            <Text style={styles.dateTextTop}>{formattedDate}</Text>
            <Text style={styles.timeTextBottom}>{formattedTime}</Text>
          </View>

          <TouchableOpacity style={styles.headerLogout} onPress={() => setLogoutVisible(true)}>
            <Ionicons name="log-out-outline" size={isMobile ? s(24) : s(28)} color="#FFFFFF" />
            <Text style={styles.headerLogoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <Animated.View
          style={[
            styles.contentArea,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.primaryCard}
            activeOpacity={0.7}
            onPress={() => router.push('/sales')}
          >
            <View style={styles.iconCircle}>
              <Ionicons
                name="play-outline"
                size={isMobile ? s(90) : s(70)}
                color={theme === 'dark' ? '#FFFFFF' : '#4A3424'}
                style={{ marginLeft: s(8) }}
              />
            </View>
            <Text style={styles.primaryCardText}>Sales</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryCard}
            activeOpacity={0.7}
            onPress={() => router.push('/orders')}
          >
            <View style={styles.iconCircle}>
              <Ionicons
                name="clipboard-outline"
                size={isMobile ? s(80) : s(60)}
                color={theme === 'dark' ? '#FFFFFF' : '#4A3424'}
              />
              {pendingCount > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.primaryCardText}>Orders</Text>
          </TouchableOpacity>

          <View style={styles.columnActions}>
            <TouchableOpacity
              style={styles.buttonAction}
              activeOpacity={0.8}
              onPress={() => router.push('/timeclock')}
            >
              <Ionicons
                name="time-outline"
                size={isMobile ? s(45) : s(35)}
                color={currentColors.textMain}
              />
              <Text style={styles.buttonActionText}>Clock In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.buttonAction}
              activeOpacity={0.8}
              onPress={() => router.push('/help')}
            >
              <Ionicons
                name="help-circle-outline"
                size={isMobile ? s(45) : s(35)}
                color={currentColors.textMain}
              />
              <Text style={styles.buttonActionText}>Help</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.buttonAction}
              activeOpacity={0.8}
              onPress={() => router.push('/about')}
            >
              <Ionicons
                name="information-circle-outline"
                size={isMobile ? s(45) : s(35)}
                color={currentColors.textMain}
              />
              <Text style={styles.buttonActionText}>About</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.buttonAction}
              activeOpacity={0.8}
              onPress={() => router.push('/settings')}
            >
              <Ionicons
                name="settings-outline"
                size={isMobile ? s(45) : s(35)}
                color={currentColors.textMain}
              />
              <Text style={styles.buttonActionText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (s, isMobile, width, isLandscape, colors, theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.containerBg },
    loadingContainer: {
      flex: 1,
      backgroundColor: colors.containerBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    bold: { fontFamily: 'Lexend_700Bold' },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: isMobile ? s(10) : s(50),
      paddingVertical: s(25),
      backgroundColor: colors.headerBg,
      borderBottomLeftRadius: s(30),
      borderBottomRightRadius: s(30),
      elevation: s(10),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
      zIndex: 10,
      flexWrap: 'nowrap',
      gap: isMobile ? s(10) : 0,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? s(10) : s(20) },
    logoCompany: { width: s(180), height: s(80) },
    logoSms: { width: s(160), height: s(75) },

    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: isMobile ? s(10) : s(40),
    },

    dateTimeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    dateTextTop: {
      color: '#E0D6D1',
      fontSize: isMobile ? s(14) : s(20),
      fontFamily: 'Lexend_700Bold',
    },
    timeTextBottom: {
      color: '#FFFFFF',
      fontSize: isMobile ? s(20) : s(36),
      fontFamily: 'Lexend_700Bold',
      marginTop: s(2),
    },

    headerLogout: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: s(2),
      borderBottomColor: '#FFFFFF',
      paddingBottom: s(2),
      marginLeft: isMobile ? s(5) : s(10),
    },
    headerLogoutText: {
      color: '#FFFFFF',
      fontSize: isMobile ? s(16) : s(24),
      fontFamily: 'Lexend_400Regular',
      marginLeft: s(5),
    },

    contentArea: {
      flex: 1,
      flexDirection: isMobile && !isLandscape ? 'column' : 'row',
      justifyContent: 'center',
      alignItems: 'center',
      padding: isMobile ? s(20) : s(50),
      gap: s(30),
    },

    primaryCard: {
      backgroundColor: colors.cardBg,
      flex: isMobile && !isLandscape ? 0 : 1,
      width: isMobile && !isLandscape ? '100%' : 'auto',
      height: isMobile && !isLandscape ? s(200) : '80%',
      borderRadius: s(35),
      justifyContent: 'center',
      alignItems: 'center',
      elevation: s(8),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
    },
    iconCircle: {
      backgroundColor: theme === 'dark' ? '#333333' : '#F5EAE6',
      width: isMobile ? s(100) : s(160),
      height: isMobile ? s(100) : s(160),
      borderRadius: s(80),
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: isMobile ? s(15) : s(30),
      position: 'relative',
    },
    primaryCardText: {
      color: colors.textMain,
      fontSize: isMobile ? s(45) : s(50),
      fontFamily: 'Lexend_400Regular',
    },

    badgeContainer: {
      position: 'absolute',
      top: 0,
      right: 0,
      backgroundColor: theme === 'dark' ? '#4A1515' : '#FDECE4',
      paddingHorizontal: isMobile ? s(16) : s(12),
      paddingVertical: isMobile ? s(8) : s(6),
      borderRadius: isMobile ? s(25) : s(20),
      minWidth: isMobile ? s(45) : s(35),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: s(1.5),
      borderColor: colors.cardBg,
    },
    badgeText: {
      color: theme === 'dark' ? '#FF8A8A' : '#A34A3B',
      fontSize: isMobile ? s(28) : s(20),
      fontFamily: 'Lexend_700Bold',
    },

    columnActions: {
      flex: isMobile && !isLandscape ? 0 : 1.2,
      width: '100%',
      flexDirection: isMobile && !isLandscape ? 'row' : 'column',
      gap: isMobile ? s(15) : s(25),
      height: isMobile && !isLandscape ? s(100) : '80%',
      justifyContent: 'space-between',
    },

    buttonAction: {
      backgroundColor: colors.cardBg,
      flex: 1,
      borderRadius: s(25),
      flexDirection: isMobile && !isLandscape ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: isMobile ? s(5) : s(20),
      paddingVertical: isMobile ? s(10) : 0,
      elevation: s(8),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
    },
    buttonActionText: {
      color: colors.textMain,
      fontSize: isMobile ? s(28) : s(40),
      fontFamily: 'Lexend_400Regular',
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContainer: {
      width: isMobile ? '90%' : '50%',
      backgroundColor: colors.cardBg,
      borderRadius: s(30),
      padding: s(50),
      alignItems: 'center',
      gap: s(30),
      elevation: s(10),
    },
    modalTitle: {
      color: colors.textMain,
      fontSize: isMobile ? s(50) : s(60),
      fontFamily: 'Lexend_700Bold',
    },
    modalSubtitle: {
      color: colors.textSub,
      fontSize: isMobile ? s(30) : s(35),
      fontFamily: 'Lexend_400Regular',
      textAlign: 'center',
      lineHeight: s(45),
      marginBottom: s(10),
    },

    buttonGroupRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      gap: s(20),
    },
    buttonConfirm: {
      backgroundColor: colors.buttonBg,
      flex: 1,
      paddingVertical: s(20),
      borderRadius: s(15),
      alignItems: 'center',
    },
    buttonConfirmText: {
      color: colors.buttonText,
      fontSize: isMobile ? s(28) : s(30),
      fontFamily: 'Lexend_700Bold',
    },

    buttonReturn: {
      backgroundColor: colors.cardBg,
      flex: 1,
      paddingVertical: s(20),
      borderRadius: s(15),
      alignItems: 'center',
      borderWidth: s(2),
      borderColor: colors.buttonBg,
    },
    buttonReturnText: {
      color: colors.buttonBg,
      fontSize: isMobile ? s(28) : s(30),
      fontFamily: 'Lexend_700Bold',
    },
  });