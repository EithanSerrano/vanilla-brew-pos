import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View
} from 'react-native';

import {
  Lexend_400Regular,
  Lexend_700Bold,
  useFonts
} from '@expo-google-fonts/lexend';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme'; // 2. IMPORT COLOR DICTIONARY
import { useAppTheme } from '../constants/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HelpScreen() {
  const router = useRouter();

  // 3. GET CURRENT THEME AND COLORS
  const { appTheme } = useAppTheme();
  const currentColors = Colors[appTheme];

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
  
  // 4. PASS COLORS INTO STYLES
  const styles = useMemo(() => getStyles(s, isMobile, width, isLandscape, currentColors), [width, height, isMobile, isLandscape, currentColors]);
  
  const [expandedSections, setExpandedSections] = useState([]);
  const [logoutVisible, setLogoutVisible] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  let [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_700Bold,
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!fontsLoaded) return null;

  const toggleSection = (sectionId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    expandedSections.includes(sectionId)
      ? setExpandedSections(expandedSections.filter(id => id !== sectionId))
      : setExpandedSections([...expandedSections, sectionId]);
  };

  const handleConfirmLogout = () => {
    setLogoutVisible(false);
    router.replace('/'); 
  };

  const formattedDate = currentTime.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' 
  });
  
  const formattedTime = currentTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', minute: '2-digit', second: '2-digit' 
  });

  const InstructionItem = ({ title, sectionId, content }) => {
    const isExpanded = expandedSections.includes(sectionId);
    return (
      <View style={styles.accordionWrapper}>
        <TouchableOpacity 
          style={[styles.accordionBtn, isExpanded && styles.accordionBtnOpen]} 
          onPress={() => toggleSection(sectionId)}
          activeOpacity={0.7}
        >
          <Text style={styles.accordionBtnText}>{title}</Text>
          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={s(35)} color={currentColors.textMain} />
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.contentBox}>
            <Text style={styles.contentText}>{content}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} />

      <Modal animationType="fade" transparent={true} visible={logoutVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Log Out?</Text>
            <Text style={styles.modalSubtitle}>
              Are you sure you want to{"\n"}
              <Text style={styles.bold}>Log Out?</Text>
            </Text>
            <TouchableOpacity style={styles.buttonBlue} onPress={handleConfirmLogout}>
              <Text style={styles.buttonBlueText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonLink} onPress={() => setLogoutVisible(false)}>
              <Text style={styles.buttonLinkText}>Return</Text>
            </TouchableOpacity>
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
        </View>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.breadcrumb}>
          <TouchableOpacity style={styles.breadcrumbBack} onPress={() => router.back()}>
            <Ionicons name="return-up-back" size={s(40)} color={currentColors.textMain} />
          </TouchableOpacity>
          <View style={styles.breadcrumbLabel}>
            <Ionicons name="help-circle-outline" size={s(40)} color={currentColors.textMain} />
            <Text style={styles.breadcrumbText}>Help</Text>
          </View>
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
        >
          <InstructionItem 
            title="How to make a Sales" 
            sectionId="sales"
            content="1. Go to Sales module.&#10;2. Select Order Mode (Dine In/Take Out).&#10;3. Add products to cart.&#10;4. Click Complete Order then Proceed to Payment.&#10;5. Enter amount and confirm."
          />
          <InstructionItem 
            title="How to Manage and Update Orders" 
            sectionId="manageOrders"
            content="1. Navigate to the Orders module from the main menu.&#10;2. In the 'Ongoing Orders' list, tap 'Complete Order' once the preparation is done.&#10;3. Open the 'Completed' drawer on the right to view finished transactions.&#10;4. To update a past transaction, tap the 'Status' button to mark it as Returned or Refunded."
          />
          <InstructionItem 
            title="How to Print a Receipt" 
            sectionId="printReceipt"
            content="1. Go to the Orders module.&#10;2. Tap on any specific order (Ongoing or Completed) to open its Transaction Details.&#10;3. Click the 'Print' button located at the top right of the window to generate and print the receipt."
          />
          <InstructionItem 
            title="How to change Account Credentials" 
            sectionId="creds"
            content="To change your password or username, please navigate to the Settings tab from the main menu or contact the system administrator if the fields are locked.&#10;&#10;Updating credentials regularly ensures the security of your Shop Management System."
          />
          <InstructionItem 
            title="Account Lockout & Security" 
            sectionId="accountSecurity"
            content="For security purposes, your account will be temporarily locked after 3 consecutive failed login attempts, and an automated alert will be sent to the Administrator.&#10;&#10;If you forget your password or get locked out, you must contact the Admin to receive a secure OTP passkey to restore your access."
          />
          <InstructionItem 
            title="Troubleshooting Connection Issues" 
            sectionId="troubleshooting"
            content="The Shop Management System relies on real-time cloud synchronization. If orders are not loading or sales fail to process, please check your device's Wi-Fi or cellular data connection.&#10;&#10;If the connection is stable but issues persist, try logging out and logging back in, or contact support."
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// 5. UPDATE GETSTYLES TO USE THE DYNAMIC COLORS
const getStyles = (s, isMobile, width, isLandscape, colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.containerBg },
  bold: { fontFamily: 'Lexend_700Bold' },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: s(100) },

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
    flexWrap: isMobile && !isLandscape ? 'wrap' : 'nowrap',
    gap: isMobile ? s(10) : 0 
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? s(10) : s(20) },
  logoCompany: { width: s(180), height: s(80) }, 
  logoSms: { width: s(160), height: s(75) }, 
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? s(10) : s(40) },
  dateTimeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
  dateTextTop: { color: '#E0D6D1', fontSize: isMobile ? s(14) : s(20), fontFamily: 'Lexend_700Bold' },
  timeTextBottom: { color: '#FFFFFF', fontSize: isMobile ? s(20) : s(36), fontFamily: 'Lexend_700Bold', marginTop: s(2) },
  
  mainContent: { flex: 1, paddingHorizontal: isMobile ? s(20) : s(60), paddingTop: s(40) },
  breadcrumb: { flexDirection: 'row', gap: s(20), marginBottom: s(30) },
  breadcrumbBack: { backgroundColor: colors.cardBg, padding: s(15), borderRadius: s(15), justifyContent: 'center' },
  breadcrumbLabel: { flex: 1, backgroundColor: colors.cardBg, borderRadius: s(15), flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(25), gap: s(15) },
  breadcrumbText: { color: colors.textMain, fontSize: s(35), fontFamily: 'Lexend_400Regular' },
  
  accordionWrapper: { marginBottom: s(15), overflow: 'hidden' }, 
  accordionBtn: { backgroundColor: colors.cardBg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: s(30), borderRadius: s(20) },
  accordionBtnOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  accordionBtnText: { color: colors.textMain, fontSize: s(30), fontFamily: 'Lexend_400Regular' },
  contentBox: { backgroundColor: colors.cardBg, padding: s(30), borderBottomLeftRadius: s(20), borderBottomRightRadius: s(20), marginTop: s(-10), zIndex: -1 },
  contentText: { color: colors.textMain, fontSize: s(26), fontFamily: 'Lexend_400Regular', lineHeight: s(40) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: isMobile ? '90%' : '50%', backgroundColor: colors.cardBg, borderRadius: s(30), padding: s(50), alignItems: 'center', gap: s(30) },
  modalTitle: { color: colors.textMain, fontSize: s(60), fontFamily: 'Lexend_700Bold' },
  modalSubtitle: { color: colors.textSub, fontSize: s(35), fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: s(45), marginBottom: s(10) },
  
  buttonBlue: { backgroundColor: colors.buttonBg, width: '100%', paddingVertical: s(20), borderRadius: s(15), alignItems: 'center' },
  buttonBlueText: { color: colors.buttonText, fontSize: s(35), fontFamily: 'Lexend_700Bold' },
  buttonLink: { paddingVertical: s(10) },
  buttonLinkText: { color: colors.textMain, fontSize: s(30), fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
});