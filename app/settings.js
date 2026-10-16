import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
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

import { EmailAuthProvider, getAuth, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Colors } from '../constants/theme';
import { useAppTheme } from '../constants/ThemeContext'; // ← shared theme
import { db } from '../firebaseConfig';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SettingsScreen() {
  const router = useRouter();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  // --- SHARED THEME (reads AND writes to the global context) ---
  const { appTheme, setAppTheme } = useAppTheme();
  const currentColors = Colors[appTheme] || Colors.light;

  // Label shown inside the dropdown trigger button
  const [systemThemeLabel, setSystemThemeLabel] = useState(
    appTheme === 'dark' ? 'Dark Mode' : 'Light Mode'
  );
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);

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
    () => getStyles(s, isMobile, width, isLandscape, currentColors),
    [width, height, isMobile, isLandscape, currentColors]
  );

  const [loading, setLoading] = useState(true);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [expandedSections, setExpandedSections] = useState([]);

  const [isEditing, setIsEditing] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ text: '', type: '' });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [passkeyVisible, setPasskeyVisible] = useState(false);

  const [passkeyInput, setPasskeyInput] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [adminOTP, setAdminOTP] = useState('');
  const [otpExpiry, setOtpExpiry] = useState(0);
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState('');

  const [currentTime, setCurrentTime] = useState(new Date());

  const nameInputRef = useRef(null);
  const currentPasswordInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);

  let [fontsLoaded] = useFonts({ Lexend_400Regular, Lexend_700Bold });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      if (currentUser) {
        setEmail(currentUser.email || '');
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            setName(userDoc.data().name || '');
          }
        } catch (error) {
          console.error('Error fetching user document:', error);
        }
      }
      setLoading(false);
    };
    fetchUserData();
  }, [currentUser]);

  const handleConfirmLogout = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { isOnline: false, lastLogin: new Date() });
      }
      await auth.signOut();
      setLogoutVisible(false);
      router.replace('/');
    } catch (error) {
      console.error('Error during logout: ', error);
      setLogoutVisible(false);
      router.replace('/');
    }
  };

  const handleActionButton = () => {
    if (isEditing) {
      if (!name.trim()) {
        setProfileMessage({ text: 'Name cannot be empty.', type: 'error' });
        return;
      }

      if (password.length > 0 || confirmPassword.length > 0 || currentPassword.length > 0) {
        if (!currentPassword) {
          setProfileMessage({
            text: 'Please enter your Current Password to set a new one.',
            type: 'error',
          });
          return;
        }
        if (password.length < 8) {
          setProfileMessage({
            text: 'New password must be at least 8 characters.',
            type: 'error',
          });
          return;
        }
        if (password !== confirmPassword) {
          setProfileMessage({ text: 'Passwords do not match.', type: 'error' });
          return;
        }
      }

      setProfileMessage({ text: '', type: '' });
      setConfirmVisible(true);
    } else {
      setProfileMessage({ text: '', type: '' });
      setPasskeyVisible(true);
    }
  };

  const closePasskeyModal = () => {
    setPasskeyVisible(false);
    setPasskeyError('');
    setPasskeyInput('');
    setOtpSentMessage('');
    setAdminOTP('');
    setOtpExpiry(0);
  };

  const handleRequestPasskey = async () => {
    setIsSendingOTP(true);
    setOtpSentMessage('');
    setPasskeyError('');

    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    setAdminOTP(generatedCode);
    setOtpExpiry(Date.now() + 5 * 60 * 1000);

    try {
      await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: process.env.EXPO_PUBLIC_EMAILJS_SERVICE_OTP,
          template_id: process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_OTP,
          user_id: process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY_OTP,
          template_params: {
            admin_email: 'qraalcanzo@tip.edu.ph',
            otp: generatedCode,
            time: new Date().toLocaleString(),
          },
        }),
      });
      setOtpSentMessage('Passkey sent to Admin (Valid for 5 mins)');
    } catch (err) {
      console.error('Could not send OTP:', err);
      setOtpSentMessage('Failed to send Passkey.');
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handlePasskeySubmit = () => {
    setPasskeyError('');

    if (!adminOTP || adminOTP === '') {
      setPasskeyError('Please request a passkey first.');
      return;
    }

    if (Date.now() > otpExpiry) {
      setPasskeyError('Passkey Expired. Request a new one.');
      setAdminOTP('');
      setOtpSentMessage('');
      setPasskeyInput('');
      return;
    }

    if (passkeyInput === adminOTP) {
      closePasskeyModal();
      setIsEditing(true);
      setProfileMessage({
        text: 'Identity verified. You may now edit your details.',
        type: 'success',
      });
    } else {
      setPasskeyError('Invalid Passkey.');
    }
  };

  const executeCredentialUpdate = async () => {
    setConfirmVisible(false);

    if (!currentUser) {
      setProfileMessage({ text: 'SESSION LOST: Try logging out and back in.', type: 'error' });
      return;
    }

    try {
      if (password.length > 0) {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, password);
      }

      await updateDoc(doc(db, 'users', currentUser.uid), {
        name: name.trim(),
        updatedAt: new Date(),
      });

      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setProfileMessage({ text: 'Account credentials successfully edited.', type: 'success' });
      setIsEditing(false);
    } catch (error) {
      console.error('Update failed:', error);
      if (
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        setProfileMessage({ text: 'Your Current Password is incorrect.', type: 'error' });
      } else {
        setProfileMessage({ text: error.message, type: 'error' });
      }
    }
  };

  const toggleSection = (sectionId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    // Close the dropdown whenever an accordion section is toggled
    setShowThemeDropdown(false);
    expandedSections.includes(sectionId)
      ? setExpandedSections(expandedSections.filter((id) => id !== sectionId))
      : setExpandedSections([...expandedSections, sectionId]);
  };

  // Writes the chosen theme to the global context (persisted via AsyncStorage inside the provider)
  const handleThemeSelect = (label, themeKey) => {
    setSystemThemeLabel(label);
    setAppTheme(themeKey);       // ← updates ALL screens instantly
    setShowThemeDropdown(false);
  };

  if (!fontsLoaded || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: currentColors.containerBg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={currentColors.textMain} />
      </View>
    );
  }

  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} />

      {/* ── Logout modal ── */}
      <Modal animationType="fade" transparent visible={logoutVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerSmall}>
            <Text style={styles.modalTitleLarge}>Log Out?</Text>
            <Text style={styles.modalSubtitleMedium}>
              Are you sure you want to{'\n'}
              <Text style={styles.bold}>Log Out?</Text>
            </Text>
            <TouchableOpacity style={styles.buttonSubmit} onPress={handleConfirmLogout}>
              <Text style={styles.buttonSubmitText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.buttonLink} onPress={() => setLogoutVisible(false)}>
              <Text style={styles.buttonLinkText}>Return</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Passkey modal ── */}
      <Modal animationType="fade" transparent visible={passkeyVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerVerify}>
            <Text style={styles.modalTitleMedium}>Verification</Text>
            <Text style={styles.modalSubtitleMedium}>
              {otpSentMessage
                ? otpSentMessage
                : 'To edit details, please request\nand enter the Admin Passkey.'}
            </Text>

            <View style={styles.otpContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const char = passkeyInput[index] || '';
                const isActive = passkeyInput.length === index;
                return (
                  <View
                    key={index}
                    style={[
                      styles.otpBox,
                      isActive && adminOTP !== '' && styles.otpBoxActive,
                      passkeyError ? styles.inputFieldError : null,
                      !adminOTP && { opacity: 0.5 },
                    ]}
                  >
                    <Text style={styles.otpText}>{char}</Text>
                  </View>
                );
              })}

              <TextInput
                style={styles.hiddenOtpInput}
                value={passkeyInput}
                onChangeText={(text) => {
                  const cleanText = text.replace(/[^0-9]/g, '');
                  setPasskeyInput(cleanText.slice(0, 6));
                  setPasskeyError('');
                }}
                maxLength={6}
                keyboardType="number-pad"
                caretHidden={true}
                editable={adminOTP !== ''}
              />
            </View>

            {passkeyError ? (
              <Text style={styles.errorTextModal}>{passkeyError}</Text>
            ) : null}

            {!adminOTP ? (
              <TouchableOpacity
                onPress={handleRequestPasskey}
                disabled={isSendingOTP}
                style={[styles.buttonSubmit, isSendingOTP && { opacity: 0.7 }]}
              >
                {isSendingOTP ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonSubmitText}>Request</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.buttonSubmit} onPress={handlePasskeySubmit}>
                <Text style={styles.buttonSubmitText}>Verify</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={closePasskeyModal}>
              <Text style={styles.linkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Confirm update modal ── */}
      <Modal animationType="fade" transparent visible={confirmVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerVerify}>
            <Text style={styles.modalTitleMedium}>Confirm Updates</Text>
            <Text style={styles.modalSubtitleMedium}>
              Are you sure you want to apply these credential updates?
            </Text>
            <TouchableOpacity style={styles.buttonSubmit} onPress={executeCredentialUpdate}>
              <Text style={styles.buttonSubmitText}>Yes, Proceed</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmVisible(false)}>
              <Text style={styles.linkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Header ── */}
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

      {/* ── Main content ── */}
      <View style={styles.mainContent}>
        <View style={styles.breadcrumb}>
          <TouchableOpacity style={styles.breadcrumbBack} onPress={() => router.back()}>
            <Ionicons name="return-up-back" size={s(40)} color={currentColors.textMain} />
          </TouchableOpacity>
          <View style={styles.breadcrumbLabel}>
            <Ionicons name="settings-outline" size={s(40)} color={currentColors.textMain} />
            <Text style={styles.breadcrumbText}>Settings</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          // Dismiss dropdown on scroll
          onScrollBeginDrag={() => setShowThemeDropdown(false)}
        >

          {/* ── Account details accordion ── */}
          <View style={styles.accordion}>
            <TouchableOpacity
              style={[
                styles.accordionHeader,
                expandedSections.includes('accountDetails') && styles.accordionHeaderOpen,
              ]}
              onPress={() => toggleSection('accountDetails')}
            >
              <Text style={styles.accordionTitle}>Change Account Details</Text>
              <Ionicons
                name={expandedSections.includes('accountDetails') ? 'chevron-up' : 'chevron-down'}
                size={s(35)}
                color={currentColors.textMain}
              />
            </TouchableOpacity>

            {expandedSections.includes('accountDetails') && (
              <View style={styles.accordionBody}>
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Name</Text>
                  <Pressable
                    style={[styles.inputPill, !isEditing && styles.inputPillDisabled]}
                    onPress={() => isEditing && nameInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={nameInputRef}
                      style={styles.inputText}
                      value={name}
                      onChangeText={setName}
                      editable={isEditing}
                    />
                  </Pressable>
                </View>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Email</Text>
                  <View style={[styles.inputPill, styles.inputPillDisabled]}>
                    <TextInput style={styles.inputText} value={email} editable={false} />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Current Password</Text>
                  <Pressable
                    style={[styles.inputPill, !isEditing && styles.inputPillDisabled]}
                    onPress={() => isEditing && currentPasswordInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={currentPasswordInputRef}
                      style={[styles.inputText, { flex: 1 }]}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry={!showCurrentPassword}
                      editable={isEditing}
                      placeholder={isEditing ? 'Enter current password' : '••••••••'}
                      placeholderTextColor={currentColors.textSub}
                    />
                    {isEditing && (
                      <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                        <Ionicons
                          name={showCurrentPassword ? 'eye-outline' : 'eye-off-outline'}
                          size={s(30)}
                          color={currentColors.textMain}
                        />
                      </TouchableOpacity>
                    )}
                  </Pressable>
                </View>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>New Password</Text>
                  <Pressable
                    style={[styles.inputPill, !isEditing && styles.inputPillDisabled]}
                    onPress={() => isEditing && passwordInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={passwordInputRef}
                      style={[styles.inputText, { flex: 1 }]}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      editable={isEditing}
                      placeholder={isEditing ? 'Enter new password' : '••••••••'}
                      placeholderTextColor={currentColors.textSub}
                    />
                    {isEditing && (
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons
                          name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                          size={s(30)}
                          color={currentColors.textMain}
                        />
                      </TouchableOpacity>
                    )}
                  </Pressable>
                </View>

                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>Confirm Password</Text>
                  <Pressable
                    style={[styles.inputPill, !isEditing && styles.inputPillDisabled]}
                    onPress={() => isEditing && confirmPasswordInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={confirmPasswordInputRef}
                      style={[styles.inputText, { flex: 1 }]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      editable={isEditing}
                      placeholder={isEditing ? 'Confirm new password' : '••••••••'}
                      placeholderTextColor={currentColors.textSub}
                    />
                    {isEditing && (
                      <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                        <Ionicons
                          name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                          size={s(30)}
                          color={currentColors.textMain}
                        />
                      </TouchableOpacity>
                    )}
                  </Pressable>
                </View>

                {profileMessage.text ? (
                  <Text
                    style={[
                      styles.profileMessageText,
                      profileMessage.type === 'error' ? styles.errorText : styles.successText,
                    ]}
                  >
                    {profileMessage.text}
                  </Text>
                ) : null}

                <TouchableOpacity style={styles.buttonAction} onPress={handleActionButton}>
                  <Text style={styles.buttonTextRegular}>
                    {isEditing ? 'Save Profile' : 'Edit Details'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── Appearance accordion ──
              FIX: removed overflow:'hidden' from the accordion wrapper so the
              dropdown can visually escape its parent container. The open-border
              radius is now handled purely through the header/body border styles. */}
          <View style={styles.accordion}>
            <TouchableOpacity
              style={[
                styles.accordionHeader,
                expandedSections.includes('appearance') && styles.accordionHeaderOpen,
              ]}
              onPress={() => toggleSection('appearance')}
            >
              <Text style={styles.accordionTitle}>Change System Appearance</Text>
              <Ionicons
                name={expandedSections.includes('appearance') ? 'chevron-up' : 'chevron-down'}
                size={s(35)}
                color={currentColors.textMain}
              />
            </TouchableOpacity>

            {expandedSections.includes('appearance') && (
              <View style={styles.accordionBody}>
                <View style={styles.formRow}>
                  <Text style={styles.formLabel}>System Theme</Text>

                  {/* Wrapper gets zIndex so the absolute dropdown floats above siblings */}
                  <View style={styles.dropdownWrapper}>
                    <TouchableOpacity
                      style={styles.inputPill}
                      activeOpacity={0.8}
                      onPress={() => setShowThemeDropdown(!showThemeDropdown)}
                    >
                      <Text style={styles.inputTextTheme}>{systemThemeLabel}</Text>
                      <Ionicons
                        name={showThemeDropdown ? 'chevron-up' : 'chevron-down'}
                        size={s(24)}
                        color={currentColors.textMain}
                      />
                    </TouchableOpacity>

                    {/* Dropdown floats absolutely so it never gets clipped */}
                    {showThemeDropdown && (
                      <View style={[styles.dropdownContainer, { paddingVertical: s(8) }]}>
                        <TouchableOpacity
                          style={[styles.dropdownItem, appTheme === 'light' && styles.dropdownItemActive]}
                          activeOpacity={0.7}
                          onPress={() => handleThemeSelect('Light Mode', 'light')}
                        >
                          <View style={styles.dropdownItemRow}>
                            <Ionicons name="sunny-outline" size={s(26)} color={appTheme === 'light' ? currentColors.buttonBg : currentColors.textMain} />
                            <Text style={[styles.dropdownText, appTheme === 'light' && styles.dropdownTextActive]}>Light Mode</Text>
                            {appTheme === 'light' && (
                              <Ionicons name="checkmark-circle" size={s(26)} color={currentColors.buttonBg} />
                            )}
                          </View>
                        </TouchableOpacity>

                        <View style={styles.dropdownDivider} />

                        <TouchableOpacity
                          style={[styles.dropdownItem, appTheme === 'dark' && styles.dropdownItemActive]}
                          activeOpacity={0.7}
                          onPress={() => handleThemeSelect('Dark Mode', 'dark')}
                        >
                          <View style={styles.dropdownItemRow}>
                            <Ionicons name="moon-outline" size={s(26)} color={appTheme === 'dark' ? currentColors.buttonBg : currentColors.textMain} />
                            <Text style={[styles.dropdownText, appTheme === 'dark' && styles.dropdownTextActive]}>Dark Mode</Text>
                            {appTheme === 'dark' && (
                              <Ionicons name="checkmark-circle" size={s(26)} color={currentColors.buttonBg} />
                            )}
                          </View>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (s, isMobile, width, isLandscape, colors) =>
  StyleSheet.create({
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
      gap: isMobile ? s(10) : 0,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? s(10) : s(20) },
    logoCompany: { width: s(180), height: s(80) },
    logoSms: { width: s(160), height: s(75) },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: isMobile ? s(10) : s(40) },
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

    mainContent: { flex: 1, paddingHorizontal: isMobile ? s(20) : s(60), paddingTop: s(40) },

    breadcrumb: { flexDirection: 'row', gap: s(20), marginBottom: s(30) },
    breadcrumbBack: {
      backgroundColor: colors.cardBg,
      padding: s(15),
      borderRadius: s(15),
      justifyContent: 'center',
    },
    breadcrumbLabel: {
      flex: 1,
      backgroundColor: colors.cardBg,
      borderRadius: s(15),
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(25),
      gap: s(15),
    },
    breadcrumbText: {
      color: colors.textMain,
      fontSize: s(35),
      fontFamily: 'Lexend_400Regular',
    },

    // NOTE: overflow:'hidden' intentionally removed so the dropdown isn't clipped
    accordion: { marginBottom: s(15) },
    accordionHeader: {
      backgroundColor: colors.cardBg,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: s(25),
      borderRadius: s(20),
    },
    accordionHeaderOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
    accordionTitle: {
      color: colors.textMain,
      fontSize: s(30),
      fontFamily: 'Lexend_400Regular',
    },
    accordionBody: {
      backgroundColor: colors.cardBg,
      paddingHorizontal: s(40),
      paddingBottom: s(30),
      borderBottomLeftRadius: s(20),
      borderBottomRightRadius: s(20),
    },

    formRow: {
      flexDirection: isMobile && !isLandscape ? 'column' : 'row',
      alignItems: isMobile && !isLandscape ? 'flex-start' : 'center',
      marginBottom: s(20),
    },
    formLabel: {
      color: colors.textMain,
      fontSize: s(30),
      fontFamily: 'Lexend_400Regular',
      width: isMobile && !isLandscape ? '100%' : s(300),
      marginBottom: isMobile && !isLandscape ? s(10) : 0,
    },

    inputPill: {
      width: '100%',
      flex: isMobile && !isLandscape ? 0 : 1,
      backgroundColor: colors.background,
      height: s(70),
      minHeight: 52,
      borderRadius: s(35),
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: s(24),
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputPillDisabled: { backgroundColor: colors.cardBg, borderColor: colors.border },

    inputText: {
      flex: 1,
      fontSize: s(25),
      color: colors.textMain,
      fontFamily: 'Lexend_400Regular',
      textAlign: 'left',
      textAlignVertical: 'center',
      padding: 0,
      outlineStyle: 'none',
    },
    inputTextTheme: {
      flex: 1,
      fontSize: s(25),
      color: colors.textMain,
      fontFamily: 'Lexend_400Regular',
      textAlign: 'center',
      textAlignVertical: 'center',
      padding: 0,
      outlineStyle: 'none',
    },

    // Wrapper that provides the elevated z-index context for the floating dropdown
    dropdownWrapper: {
      flex: isMobile && !isLandscape ? 0 : 1,
      width: '100%',
      zIndex: 999,
      elevation: 999, // Android z-index equivalent
    },

    // Absolutely positioned so it overlaps content below instead of pushing it down
    dropdownContainer: {
      position: 'absolute',
      top: s(78), // just below the pill trigger
      left: 0,
      right: 0,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: s(15),
      zIndex: 1000,
      elevation: 1000,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    dropdownItem: {
      paddingVertical: s(20),
      paddingHorizontal: s(24),
    },
    dropdownItemActive: {
      backgroundColor: colors.background,
      borderRadius: s(10),
      marginHorizontal: s(8),
      marginVertical: s(4),
    },
    dropdownItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s(14),
    },
    dropdownDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: s(16),
    },
    dropdownText: {
      flex: 1,
      fontSize: s(24),
      color: colors.textMain,
      fontFamily: 'Lexend_400Regular',
    },
    dropdownTextActive: {
      fontFamily: 'Lexend_700Bold',
      color: colors.buttonBg,
    },

    profileMessageText: {
      fontSize: s(20),
      fontFamily: 'Lexend_400Regular',
      textAlign: 'center',
      marginBottom: s(15),
    },
    errorText: { color: '#DF0C0C' },
    successText: { color: '#0A5A3A' },

    buttonAction: {
      backgroundColor: colors.buttonBg,
      paddingVertical: s(15),
      width: s(300),
      borderRadius: s(30),
      alignSelf: 'center',
      marginTop: s(10),
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonTextRegular: {
      color: colors.buttonText,
      fontSize: s(25),
      textAlign: 'center',
      fontFamily: 'Lexend_700Bold',
    },
    buttonLink: { paddingVertical: s(10) },
    buttonLinkText: {
      color: colors.textMain,
      fontSize: s(25),
      textDecorationLine: 'underline',
      fontFamily: 'Lexend_400Regular',
      textAlign: 'center',
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContainerSmall: {
      width: width < 900 ? '80%' : '40%',
      backgroundColor: colors.cardBg,
      borderRadius: s(25),
      padding: s(40),
      alignItems: 'center',
      gap: s(20),
    },
    modalContainerVerify: {
      width: width < 900 ? '85%' : '45%',
      backgroundColor: colors.cardBg,
      borderRadius: s(25),
      padding: s(35),
      alignItems: 'center',
      gap: s(15),
    },
    modalTitleLarge: {
      color: colors.textMain,
      fontSize: s(45),
      fontFamily: 'Lexend_700Bold',
      textAlign: 'center',
    },
    modalTitleMedium: {
      color: colors.textMain,
      fontSize: s(35),
      fontFamily: 'Lexend_700Bold',
      textAlign: 'center',
    },
    modalSubtitleMedium: {
      color: colors.textSub,
      fontSize: s(22),
      textAlign: 'center',
      fontFamily: 'Lexend_400Regular',
      lineHeight: s(30),
    },

    otpContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: s(10),
      width: '100%',
      position: 'relative',
      marginTop: s(10),
      marginBottom: s(15),
    },
    otpBox: {
      width: s(50),
      height: s(60),
      backgroundColor: colors.background,
      borderRadius: s(10),
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: s(2),
      borderColor: colors.border,
    },
    otpBoxActive: { borderColor: colors.buttonBg },
    otpText: { fontSize: s(28), fontFamily: 'Lexend_700Bold', color: colors.textMain },
    hiddenOtpInput: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      opacity: 0,
      outlineStyle: 'none',
    },
    inputFieldError: { backgroundColor: '#FFB2B2', borderWidth: s(2), borderColor: '#DF0C0C' },
    errorTextModal: {
      color: '#DF0C0C',
      fontSize: s(18),
      fontFamily: 'Lexend_400Regular',
      textAlign: 'center',
      marginTop: s(5),
    },

    buttonSubmit: {
      backgroundColor: colors.buttonBg,
      width: '70%',
      paddingVertical: s(15),
      borderRadius: s(15),
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: s(15),
      marginBottom: s(10),
      minHeight: s(60),
    },
    buttonSubmitText: {
      color: colors.buttonText,
      fontSize: s(26),
      fontFamily: 'Lexend_700Bold',
    },
    linkText: {
      color: colors.textMain,
      fontSize: s(22),
      fontFamily: 'Lexend_400Regular',
      opacity: 0.9,
      textDecorationLine: 'underline',
    },
  });