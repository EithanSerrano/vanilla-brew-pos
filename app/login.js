import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { LinearGradient } from 'expo-linear-gradient';

import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { getHomeRoute, normalizeRole } from '../constants/roles';
import { auth, db } from '../firebaseConfig';

export default function LoginScreen() {
  const router = useRouter();
  
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

  const s = (size) => Math.max(Math.round(size * scaleRatio), 1); 
  const styles = useMemo(() => getStyles(s, isMobile, width, isLandscape), [width, height, isMobile, isLandscape]);

  const [currentView, setCurrentView] = useState('login'); 

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const [passkeyInput, setPasskeyInput] = useState('');
  const [passkeyError, setPasskeyError] = useState(''); 
  const [adminOTP, setAdminOTP] = useState('');
  const [otpExpiry, setOtpExpiry] = useState(0); 
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState('');

  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  let [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_700Bold,
    Lexend_900Black,
  });

  useFocusEffect(
    useCallback(() => {
      setUsername(''); 
      setPassword(''); 
      setUsernameError(''); 
      setPasswordError('');
      setLoading(false);
      setCurrentView('login');
    }, [])
  );

  useEffect(() => {
    let interval;
    if (lockoutUntil > Date.now()) {
      interval = setInterval(() => {
        const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockoutUntil(0); setAttempts(0); attemptsRef.current = 0; setCountdown(0); clearInterval(interval);
        } else { setCountdown(remaining); }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  if (!fontsLoaded) {
    return (
      <LinearGradient colors={['#d4a07a', '#7a3018']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </LinearGradient>
    );
  }

  const handleLogin = async () => {
    if (lockoutUntil > Date.now()) return;

    setUsernameError('');
    setPasswordError('');

    let isValid = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (username.trim().length < 6 || username.trim().length > 254 || !emailRegex.test(username.trim())) { 
      setUsernameError("Please enter a valid email"); 
      isValid = false; 
    }
    if (password.length < 8 || password.length > 64) { 
      setPasswordError("Password must be at least 8 characters"); 
      isValid = false; 
    }
    
    if (!isValid) {
      attemptsRef.current += 1;
      const newAttempts = attemptsRef.current;
      setAttempts(newAttempts);

      if (newAttempts >= 3) {
        setLockoutUntil(Date.now() + 30000); 
        setPasswordError("Too many invalid attempts. Please wait 30 seconds.");

        try {
          await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: process.env.EXPO_PUBLIC_EMAILJS_SERVICE_OTP,
              template_id: process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ALERT,
              user_id: process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY_OTP,
              template_params: {
                user_email: username.trim(),
                time: new Date().toLocaleString(),
              }
            }),
          });
        } catch (e) {
          console.error("Could not send EmailJS alert:", e);
        }
      }
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, username.trim(), password);
      
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        let role = normalizeRole(null);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          role = normalizeRole(userData?.role);
          if (userData?.status?.toLowerCase() === 'inactive') {
            await auth.signOut(); 
            setUsernameError("_hide");
            setPasswordError("Invalid username or password.");
            setLoading(false);
            return; 
          }
        }
        
        setAttempts(0);
        attemptsRef.current = 0;
        
        await updateDoc(userDocRef, { 
          isOnline: true,
          lastLogin: new Date()
        });

        router.replace(getHomeRoute(role));
      }
    } catch (error) {
      attemptsRef.current += 1;
      const newAttempts = attemptsRef.current;
      setAttempts(newAttempts);
      
      setUsernameError('_hide');

      if (newAttempts >= 3) {
        setLockoutUntil(Date.now() + 30000); 
        setPasswordError("Too many failed attempts. Please wait 30 seconds.");
        
        try {
          await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: process.env.EXPO_PUBLIC_EMAILJS_SERVICE_OTP,
              template_id: process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ALERT,
              user_id: process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY_OTP,
              template_params: {
                user_email: username.trim(),
                time: new Date().toLocaleString(),
              }
            }),
          });
        } catch (e) {
          console.error("Could not send EmailJS alert:", e);
        }

      } else {
        setPasswordError("Invalid username or password.");
      }
    } finally {
      setLoading(false);
    }
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
          }
        }),
      });
      setOtpSentMessage('Passkey sent to Admin (Valid for 5 mins)');
    } catch (err) {
      console.error("Could not send OTP:", err);
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
      setCurrentView('forgot');
      setPasskeyInput('');
      setPasskeyError('');
      setAdminOTP('');
      setOtpExpiry(0);
    } else {
      setPasskeyError('Invalid Passkey.');
    }
  };

  const handleResetPassword = async () => {
  if (resetEmail.trim() === '') {
    setResetError(true);
    return;
  }
  setIsSubmitting(true);
  
  try {
    // 1. Verify user existence
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where("email", "==", resetEmail.trim()), limit(1));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      Alert.alert("Account Not Found", "There is no registered staff member with this email.");
      setResetError(true);
      setIsSubmitting(false);
      return; 
    }

    // 2. Request custom link from Vercel backend API
    const response = await fetch('https://vnlbrew.shop/api/send-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail.trim() })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to generate link");

    // 3. Send link via EmailJS and WAIT for the response
    const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: process.env.EXPO_PUBLIC_EMAILJS_SERVICE_RESET,
template_id: process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_RESET,
user_id: process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY_RESET,
        template_params: {
          email: resetEmail.trim(),
          link: data.link,
        }
      }),
    });

    // Check if EmailJS actually succeeded
    if (emailResponse.ok) {
      setSuccessMessage(true);
    } else {
      const errorText = await emailResponse.text();
      console.error("EmailJS Error:", errorText);
      throw new Error("Failed to send email. Check console for details.");
    }

  } catch (error) {
    console.error("Custom Reset Error:", error);
    Alert.alert("Error", error.message);
    setResetError(true);
  } finally {
    setIsSubmitting(false);
  }
};

  const isLockedOut = lockoutUntil > Date.now();

  return (
    <LinearGradient colors={['#d4a07a', '#7a3018']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView 
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.loginCard}>
              <View style={styles.logoRow}>
                <Image source={require('../assets/images/company-logo1.png')} style={styles.logoMain} resizeMode="contain" />
                <Image source={require('../assets/images/sms-logo1.png')} style={styles.logoMain} resizeMode="contain" />
              </View>

              {currentView === 'login' && (
                <View style={styles.viewContainer}>
                  <Text style={styles.instructionText}>Please enter your credentials</Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Email</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        usernameError ? styles.inputFieldError : null,
                        isLockedOut && styles.inputLocked
                      ]}
                      value={username}
                      onChangeText={(text) => { setUsername(text); setUsernameError(''); }}
                      editable={!loading && !isLockedOut}
                      maxLength={254}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {usernameError && usernameError !== '_hide' ? <Text style={styles.errorText}>{usernameError}</Text> : null}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Password</Text>
                    <View style={styles.passwordWrapper}>
                      <TextInput
                        style={[
                          styles.inputField, 
                          passwordError ? styles.inputFieldError : null, 
                          { paddingRight: s(60) }, 
                          isLockedOut && styles.inputLocked
                        ]}
                        value={password}
                        onChangeText={(text) => { setPassword(text); setPasswordError(''); }}
                        secureTextEntry={!showPassword}
                        editable={!loading && !isLockedOut}
                        maxLength={64}
                      />
                      <TouchableOpacity style={styles.passwordEye} onPress={() => setShowPassword(!showPassword)} disabled={isLockedOut}>
                        <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={s(28)} color={isLockedOut ? '#AAAAAA' : '#000000'} />
                      </TouchableOpacity>
                    </View>
                    {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                  </View>

                  <TouchableOpacity 
                    style={[styles.buttonSubmit, isLockedOut && styles.buttonLocked]} 
                    onPress={handleLogin} 
                    disabled={loading || isLockedOut}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={[styles.buttonSubmitText, isLockedOut && styles.textLocked]}>
                        {isLockedOut ? `Locked (${countdown}s)` : 'Log In'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setCurrentView('passkey')} disabled={loading || isLockedOut}>
                    <Text style={[styles.linkText, isLockedOut && { opacity: 0.5 }]}>Forgot Password?</Text>
                  </TouchableOpacity>
                </View>
              )}

              {currentView === 'passkey' && (
                <View style={styles.viewContainer}>
                  <Text style={styles.instructionText}>Admin Authorization Required</Text>
                  <Text style={styles.subText}>
                    {otpSentMessage ? otpSentMessage : "Please request a one-time Passkey\nto authorize a password reset."}
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
                            !adminOTP && { opacity: 0.5 } 
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
                  
                  {passkeyError ? <Text style={[styles.errorText, { marginBottom: s(15) }]}>{passkeyError}</Text> : null}

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

                  <TouchableOpacity onPress={() => { setCurrentView('login'); setPasskeyError(''); setPasskeyInput(''); setOtpSentMessage(''); setAdminOTP(''); setOtpExpiry(0); }}>
                    <Text style={styles.linkText}>Go Back</Text>
                  </TouchableOpacity>
                </View>
              )}

              {currentView === 'forgot' && (
                <View style={styles.viewContainer}>
                  {successMessage ? (
                    <View style={{ alignItems: 'center', width: '100%' }}>
                      <Text style={[styles.instructionText, { fontSize: s(28) }]}>Link Sent!</Text>
                      <Text style={styles.subText}>A secure password reset link has been{'\n'}sent to the requested email.</Text>
                      <TouchableOpacity 
                        style={[styles.buttonSubmit, { backgroundColor: '#007BFF', width: isMobile ? '90%' : '85%' }]} 
                        onPress={() => { setCurrentView('login'); setSuccessMessage(false); setResetError(false); setResetEmail(''); }}
                      >
                        <Text style={styles.buttonSubmitText} numberOfLines={1} adjustsFontSizeToFit>Return to Login</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ width: '100%', alignItems: 'center' }}>
                      <Text style={styles.instructionText}>Authorization Confirmed</Text>
                      <Text style={styles.subText}>Enter the staff account email below.</Text>
                      
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{resetError ? 'Email Not Found' : 'Email Address'}</Text>
                        <TextInput
                          style={[styles.inputField, resetError ? styles.inputFieldError : null]}
                          value={resetEmail}
                          onChangeText={(text) => { setResetEmail(text); setResetError(false); }}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          editable={!isSubmitting}
                        />
                      </View>

                      <TouchableOpacity style={styles.buttonSubmit} onPress={handleResetPassword} disabled={isSubmitting}>
                        {isSubmitting ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.buttonSubmitText}>Send Reset Link</Text>
                        )}
                      </TouchableOpacity>
                      
                      <TouchableOpacity onPress={() => { setCurrentView('login'); setResetError(false); setResetEmail(''); }} disabled={isSubmitting}>
                        <Text style={styles.linkText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const getStyles = (s, isMobile, width, isLandscape) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' }, 
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  
  scrollContent: { 
    flexGrow: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: isMobile ? s(20) : s(20) 
  },
  
  loginCard: { 
    backgroundColor: '#FBFBFB', 
    borderRadius: s(20), 
    padding: isMobile ? s(25) : s(40), 
    width: '100%', 
    maxWidth: s(500), 
    height: 'auto', 
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center', 
    elevation: s(10),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5
  },
  
  logoRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: isMobile ? s(10) : s(20), 
    alignItems: 'center', 
    width: '100%', 
    marginBottom: isMobile ? s(20) : s(30) 
  },
  logoMain: { flex: 1, maxWidth: isMobile ? s(140) : s(160), height: isMobile ? s(80) : s(90) },
  
  viewContainer: { width: '100%', alignItems: 'center' },
  
  instructionText: { color: '#000000', fontSize: s(18), fontFamily: 'Lexend_400Regular', marginTop: s(5), marginBottom: isMobile ? s(15) : s(25), textAlign: 'center' },
  subText: { color: '#333333', fontSize: s(15), textAlign: 'center', marginBottom: s(20), fontFamily: 'Lexend_400Regular', lineHeight: s(22) },
  
  inputGroup: { width: '100%', marginBottom: isMobile ? s(15) : s(20), alignItems: 'flex-start' },
  inputLabel: { color: '#000000', fontSize: s(16), fontFamily: 'Lexend_700Bold', marginBottom: s(8) },
  
  inputField: { 
    backgroundColor: '#FFFFFF', 
    width: '100%', 
    height: s(50), 
    borderRadius: s(8), 
    paddingHorizontal: s(15), 
    fontSize: s(16), 
    color: '#000000', 
    fontFamily: 'Lexend_400Regular',
    borderWidth: s(1),
    borderColor: '#AAAAAA'
  },
  
  inputFieldError: { backgroundColor: '#FFB2B2', borderWidth: s(2), borderColor: '#DF0C0C' }, 
  errorText: { color: '#DF0C0C', fontSize: s(14), marginTop: s(5), fontFamily: 'Lexend_400Regular', textAlign: 'center' },
  
  inputLocked: { backgroundColor: '#EFEFEF', color: '#AAAAAA', opacity: 0.8 }, 
  
  passwordWrapper: { width: '100%', position: 'relative' },
  passwordEye: { position: 'absolute', right: s(15), height: '100%', justifyContent: 'center', alignItems: 'center' },
  
  otpContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: s(6), 
    width: '100%', 
    marginBottom: s(15), 
    position: 'relative' 
  },
  otpBox: { 
    width: isMobile ? s(42) : s(50), 
    height: isMobile ? s(52) : s(60), 
    backgroundColor: '#FFFFFF', 
    borderRadius: s(8), 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: s(1), 
    borderColor: '#AAAAAA' 
  },
  otpBoxActive: { borderColor: '#AD725B', borderWidth: s(2) },
  otpText: { fontSize: s(24), fontFamily: 'Lexend_700Bold', color: '#000000' },
  hiddenOtpInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },

  buttonSubmit: { 
    backgroundColor: '#AD725B', 
    width: isMobile ? '80%' : '50%', 
    paddingVertical: s(12), 
    borderRadius: s(25), 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: s(10), 
    marginBottom: s(25), 
    minHeight: s(50) 
  },
  buttonSubmitText: { color: '#FFFFFF', fontSize: s(18), fontFamily: 'Lexend_700Bold' },
  buttonLocked: { backgroundColor: '#AAAAAA' }, 
  textLocked: { color: '#FFFFFF' },
  linkText: { color: '#000000', fontSize: s(15), fontFamily: 'Lexend_400Regular', opacity: 0.9 },
});