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

import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import { Colors } from '../constants/theme'; // 2. IMPORT COLOR DICTIONARY
import { useAppTheme } from '../constants/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AboutScreen() {
  const router = useRouter();

  // 3. GET CURRENT THEME AND COLORS
  const { appTheme } = useAppTheme();
  const currentColors = Colors[appTheme] || Colors.light;

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
  
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [expandedSections, setExpandedSections] = useState([]);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [deviceRam, setDeviceRam] = useState('Loading...');
  const [deviceStorage, setDeviceStorage] = useState('Loading...');
  const [deviceOS, setDeviceOS] = useState('Loading...');
  const [deviceCPU, setDeviceCPU] = useState('Loading...');
  const [deviceModel, setDeviceModel] = useState('Loading...');

  let [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_700Bold,
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchSpecs = async () => {
      const memoryInGB = Device.totalMemory 
        ? Math.ceil(Device.totalMemory / (1024 * 1024 * 1024)) + ' GB' 
        : 'Unknown';
      setDeviceRam(memoryInGB);

      const osName = Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'Unknown OS';
      setDeviceOS(`${osName} ${Device.osVersion || ''}`.trim());

      setDeviceModel(Device.modelName || 'Unknown Device');

      const cpuArch = Device.supportedCpuArchitectures && Device.supportedCpuArchitectures.length > 0
        ? Device.supportedCpuArchitectures[0]
        : 'Unknown Arch';
        
      let formattedCPU = cpuArch;
      if (cpuArch === 'arm64-v8a') formattedCPU = '64-bit ARM (arm64-v8a)';
      else if (cpuArch === 'armeabi-v7a') formattedCPU = '32-bit ARM (armeabi-v7a)';
      else if (cpuArch === 'x86_64') formattedCPU = 'x86 64-bit (x86_64)';
      
      setDeviceCPU(formattedCPU);

      try {
        if (typeof FileSystem.getTotalDiskCapacityAsync === 'function') {
          const totalDiskSpace = await FileSystem.getTotalDiskCapacityAsync();
          if (totalDiskSpace) {
            const rawGB = totalDiskSpace / (1024 * 1024 * 1024);
            const standardSizes = [16, 32, 64, 128, 256, 512, 1024];
            let commercialSize = standardSizes.find(size => rawGB <= size) || Math.ceil(rawGB);
            setDeviceStorage(`${commercialSize} GB`);
          } else {
            setDeviceStorage('Unknown');
          }
        } else {
          setDeviceStorage('API Restricted');
        }
      } catch (error) {
        setDeviceStorage('Unavailable');
      }
    };

    fetchSpecs();
  }, []);

  if (!fontsLoaded) return null;

  const handleConfirmLogout = () => {
    setLogoutVisible(false);
    router.replace('/'); 
  };

  const toggleSection = (sectionId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    expandedSections.includes(sectionId)
      ? setExpandedSections(expandedSections.filter(id => id !== sectionId))
      : setExpandedSections([...expandedSections, sectionId]);
  };

  const formattedDate = currentTime.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' 
  });
  
  const formattedTime = currentTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', minute: '2-digit', second: '2-digit' 
  });

  const SystemSpecContent = () => (
    <View style={styles.specRow}>
      <View style={styles.specColumn}>
        <Text style={styles.specHeader}>Minimum Device Specification</Text>
        <Text style={styles.contentText}>• RAM: 4GB</Text>
        <Text style={styles.contentText}>• Storage: 32GB</Text>
        <Text style={styles.contentText}>• OS: Android 11+</Text>
        <Text style={styles.contentText}>• CPU: 2.0GHz Quad-core</Text>
      </View>

      <View style={styles.specColumn}>
        <Text style={styles.specHeader}>Recommended Device Specification</Text>
        <Text style={styles.contentText}>• RAM: 6GB+</Text>
        <Text style={styles.contentText}>• Storage: 64GB+</Text>
        <Text style={styles.contentText}>• OS: Android 13+</Text>
        <Text style={styles.contentText}>• CPU: 2.4GHz Octa-core</Text>
      </View>

      <View style={styles.specColumn}>
        <Text style={styles.specHeader}>Current Device Specification</Text>
        <Text style={styles.contentText}>• Device: {deviceModel}</Text>
        <Text style={styles.contentText}>• OS: {deviceOS}</Text>
        <Text style={styles.contentText}>• CPU: {deviceCPU}</Text>
        <Text style={styles.contentText}>• RAM: {deviceRam}</Text>
        <Text style={styles.contentText}>• Storage: {deviceStorage}</Text>
      </View>
    </View>
  );

  const AccordionItem = ({ title, sectionId, content }) => {
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
            {content}
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
          <Image source={require('../assets/images/company-logo1.png')} style={[styles.logoCompany, { tintColor: '#FFFFFF' }]} resizeMode="contain" />
          <Image source={require('../assets/images/sms-logo1.png')} style={[styles.logoSms, { tintColor: '#FFFFFF' }]} resizeMode="contain" />
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
            <Ionicons name="information-circle-outline" size={s(40)} color={currentColors.textMain} />
            <Text style={styles.breadcrumbText}>About</Text>
          </View>
        </View>

        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
        >
          <AccordionItem 
            title="System Specification" 
            sectionId="systemSpec"
            content={<SystemSpecContent />}
          />
          <AccordionItem 
            title="Company Profile" 
            sectionId="companyProfile"
            content={
              <View>
                <Text style={styles.contentText}>
                  • <Text style={styles.bold}>Business Name:</Text> VNL BREW CAFE
                  {"\n"}• <Text style={styles.bold}>Establishment Date:</Text> July 2019
                  {"\n"}• <Text style={styles.bold}>Location:</Text> 110 1st Street, San Martin Subdivision, Angono, Rizal
                  {"\n\n"}
                  We specialize in a variety of refreshing beverages and light refreshments, featuring:
                  {"\n"}• Milk tea
                  {"\n"}• Hot/Cold Coffee
                  {"\n"}• Fruit Blender drinks
                  {"\n"}• Shawarma Meals
                </Text>
              </View>
            }
          />
          <AccordionItem 
            title="App Version & Details" 
            sectionId="appVersion"
            content={
              <View>
                <Text style={styles.contentText}>
                  • <Text style={styles.bold}>Application Name:</Text> Vanilla Brew POS & SMS
                  {"\n"}• <Text style={styles.bold}>Current Version:</Text> v1.0.0 (Release)
                  {"\n"}• <Text style={styles.bold}>Environment:</Text> Production
                  {"\n\n"}
                  <Text style={styles.bold}>Proprietary Notice:</Text>
                  {"\n"}This software is the exclusive property of VNL Brew Cafe. Unauthorized copying, modification, or distribution is strictly prohibited.
                </Text>
              </View>
            }
          />
          <AccordionItem 
            title="Developers & Support" 
            sectionId="developers"
            content={
              <View>
                <Text style={styles.contentText}>
                  This Shop Management System was custom-built for VNL Brew Cafe by <Text style={styles.bold}>3rd Year BSCS Students</Text> from the <Text style={styles.bold}>Technological Institute of the Philippines - Quezon City</Text>.
                  {"\n\n"}
                  <Text style={styles.bold}>Lead Developers:</Text>
                  {"\n"}• <Text style={styles.bold}>Alcanzo, Renz A.</Text>
                  {"\n"}  Email: qraalcanzo@tip.edu.ph
                  {"\n"}• <Text style={styles.bold}>Nueva, Carl Josef E.</Text>
                  {"\n"}  Email: qcjenueva@tip.edu.ph
                  {"\n"}• <Text style={styles.bold}>Sarmiento, Joaquín Reymond G.</Text>
                  {"\n"}  Email: qjrgsarmiento@tip.edu.ph
                  {"\n\n"}
                  <Text style={styles.bold}>Need Help or Found a Bug?</Text>
                  {"\n"}If the system crashes, fails to print receipts, or experiences database errors during a shift, please report it immediately to the developers using the emails provided above.
                </Text>
              </View>
            }
          />
          <AccordionItem 
            title="Tools Used" 
            sectionId="toolsUsed"
            content={
              <View>
                <Text style={styles.contentText}>
                  This application is powered by modern, cloud-based technologies to ensure speed, security, and reliability:
                  {"\n\n"}
                  • <Text style={styles.bold}>React Native / Expo:</Text> For cross-platform mobile development and UI rendering.
                  {"\n"}• <Text style={styles.bold}>Firebase Firestore:</Text> For real-time database synchronization and order management.
                  {"\n"}• <Text style={styles.bold}>Firebase Authentication:</Text> For secure login and staff credential management.
                  {"\n"}• <Text style={styles.bold}>EmailJS:</Text> For automated security alerts and OTP passkey generation.
                </Text>
              </View>
            }
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
  breadcrumbText: { color: colors.textMain, fontSize: s(32), fontFamily: 'Lexend_400Regular' },
  
  accordionWrapper: { marginBottom: s(15), overflow: 'hidden' }, 
  accordionBtn: { backgroundColor: colors.cardBg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: s(30), borderRadius: s(20) },
  accordionBtnOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  accordionBtnText: { color: colors.textMain, fontSize: s(30), fontFamily: 'Lexend_400Regular', flexShrink: 1 },
  contentBox: { backgroundColor: colors.cardBg, padding: s(30), borderBottomLeftRadius: s(20), borderBottomRightRadius: s(20), marginTop: s(-10), zIndex: -1 },
  
  contentText: { color: colors.textMain, fontSize: s(22), fontFamily: 'Lexend_400Regular', lineHeight: s(34) },
  
  specRow: { flexDirection: isMobile && !isLandscape ? 'column' : 'row', justifyContent: 'space-between', gap: s(20) },
  specColumn: { flex: 1 },
  specHeader: { color: colors.textHeader, fontSize: s(28), fontFamily: 'Lexend_700Bold', marginBottom: s(15) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: isMobile ? '90%' : '50%', backgroundColor: colors.cardBg, borderRadius: s(30), padding: s(50), alignItems: 'center', gap: s(30) },
  modalTitle: { color: colors.textMain, fontSize: s(40), fontFamily: 'Lexend_700Bold' },
  modalSubtitle: { color: colors.textSub, fontSize: s(28), fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: s(38), marginBottom: s(10) },
  
  buttonBlue: { backgroundColor: colors.buttonBg, width: '100%', paddingVertical: s(20), borderRadius: s(15), alignItems: 'center' },
  buttonBlueText: { color: colors.buttonText, fontSize: s(28), fontFamily: 'Lexend_700Bold' },
  buttonLink: { paddingVertical: s(10) },
  buttonLinkText: { color: colors.textMain, fontSize: s(24), fontFamily: 'Lexend_400Regular', textDecorationLine: 'underline' },
});