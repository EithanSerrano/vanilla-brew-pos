import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  Lexend_400Regular,
  Lexend_700Bold,
  Lexend_900Black,
  useFonts
} from '@expo-google-fonts/lexend';
import { Ionicons } from '@expo/vector-icons';

import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState(1);
  
  const [passkey, setPasskey] = useState('');
  const [email, setEmail] = useState('');
  
  const [formError, setFormError] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const { width } = useWindowDimensions(); 
  const isTablet = width > 600;
  
  const router = useRouter();

  let [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_700Bold,
    Lexend_900Black,
  });

  useFocusEffect(
    useCallback(() => {
      setStep(1);
      setPasskey('');
      setEmail('');
      setFormError(false);
      setSuccessVisible(false);
      setErrorModalVisible(false);
      setLoading(false);
    }, [])
  );

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1DA1D9" />
      </View>
    );
  }

  const handleVerifyPasskey = () => {
    if (passkey === "VNLADMIN001") {
      setFormError(false);
      setStep(2);
    } else {
      setFormError(true);
    }
  };

  const handleResetPassword = async () => {
    if (email.trim() === '') {
      setFormError(true);
      return;
    }

    setLoading(true);

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where("email", "==", email.trim()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setErrorMessage("Account Not Found: There is no registered staff member with this email address.");
        setErrorModalVisible(true);
        setLoading(false);
        return; 
      }

      await sendPasswordResetEmail(auth, email.trim());
      setSuccessVisible(true);

    } catch (error) {
      console.error("Firebase Reset Error:", error);
      
      if (error.code === 'auth/user-not-found') {
         setErrorMessage("This email is not registered in the authentication system.");
      } else if (error.code === 'auth/invalid-email') {
         setErrorMessage("The email address is improperly formatted.");
      } else {
         setErrorMessage("An error occurred: " + error.message);
      }
      setErrorModalVisible(true);
      
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      {/* MODAL: SUCCESS */}
      <Modal animationType="fade" transparent visible={successVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerLarge}>
            <Text style={styles.modalTitleLarge}>Link Sent!</Text>
            <Text style={styles.modalSubtitleLarge}>A secure password reset link has been{"\n"}sent to the requested email.</Text>
            <TouchableOpacity 
              style={styles.buttonDark} 
              onPress={() => { setSuccessVisible(false); router.replace('/'); }}
            >
              <Text style={styles.buttonTextRegular}>Return to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: ERROR */}
      <Modal animationType="fade" transparent visible={errorModalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerLarge}>
            
            <View style={styles.errorIconContainer}>
              <Ionicons name="alert-circle-outline" size={60} color="#FF4444" />
            </View>
            
            <Text style={styles.modalTitleLarge}>Action Failed</Text>
            <Text style={styles.modalSubtitleLarge}>{errorMessage}</Text>
            
            <TouchableOpacity 
              style={styles.buttonDark} 
              onPress={() => setErrorModalVisible(false)}
            >
              <Text style={styles.buttonTextRegular}>Understood</Text>
            </TouchableOpacity>
            
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* FIXED: Removed landscape logic entirely. Locks natively to exactly 550 or 650 */}
        <View style={[styles.loginCard, isTablet && styles.tabletCard]}>
          <View style={styles.headerRow}>
            <Image 
              source={require('../assets/images/company-logo.png')} 
              style={styles.logoImage}
              resizeMode="contain" 
            />
            <Image 
              source={require('../assets/images/sms-logo.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {step === 1 ? (
            <>
              <Text style={styles.instructionTitle}>Admin Verification</Text>
              <Text style={styles.instructionSub}>
                Please ask your administrator to enter their Passkey for authorization.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Admin Passkey {formError && <Text style={styles.errorText}>(Invalid)</Text>}
                </Text>
                <TextInput
                  style={[styles.input, formError && styles.inputError]}
                  value={passkey}
                  onChangeText={(text) => {
                    setPasskey(text);
                    setFormError(false);
                  }}
                  secureTextEntry
                  textAlign="center"
                  placeholder="••••••"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <TouchableOpacity 
                style={styles.enterButton} 
                activeOpacity={0.8}
                onPress={handleVerifyPasskey}
              >
                <Text style={styles.buttonText}>Verify</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.instructionTitle}>Reset Password</Text>
              <Text style={styles.instructionSub}>
                Authorization successful. Please enter the staff member's email address to send a secure reset link.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Email Address {formError && email.trim() === '' && <Text style={styles.errorText}>(Required)</Text>}
                </Text>
                <TextInput
                  style={[styles.input, formError && email.trim() === '' && styles.inputError]}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setFormError(false);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#94a3b8"
                  editable={!loading}
                />
              </View>

              <TouchableOpacity 
                style={styles.enterButton} 
                activeOpacity={0.8}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => {
            if (step === 2) {
              setStep(1);
            } else {
              router.back();
            }
          }} disabled={loading}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#202020' },
  loadingContainer: { flex: 1, backgroundColor: '#202020', justifyContent: 'center', alignItems: 'center' },
  keyboardView: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  
  // FIXED
  loginCard: { 
    backgroundColor: '#2a2a2a', 
    borderRadius: 30, 
    padding: 40, 
    width: '100%', 
    maxWidth: 550, 
    alignItems: 'center', 
    elevation: 10 
  },
  tabletCard: { maxWidth: 650, padding: 60 },
  
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: 40, 
    alignItems: 'center', 
    width: '100%', 
    marginBottom: 30 
  },
  logoImage: { width: 180, height: 100 },
  instructionTitle: { 
    color: '#fff', 
    fontSize: 26, 
    fontFamily: 'Lexend_700Bold', 
    textAlign: 'center', 
    marginBottom: 10 
  },
  instructionSub: { 
    color: '#fff', 
    fontSize: 22, 
    fontFamily: 'Lexend_400Regular', 
    textAlign: 'center', 
    marginBottom: 30, 
    paddingHorizontal: 10, 
    lineHeight: 35 
  },
  inputGroup: { width: '100%', marginBottom: 25 },
  label: { 
    color: '#fff', 
    fontSize: 26, 
    fontFamily: 'Lexend_700Bold', 
    marginBottom: 10 
  },
  input: { 
    backgroundColor: '#fff', 
    width: '100%', 
    height: 65, 
    borderRadius: 15, 
    paddingHorizontal: 20, 
    fontSize: 24, 
    color: '#000', 
    fontFamily: 'Lexend_400Regular', 
    borderWidth: 2, 
    borderColor: 'transparent' 
  },
  inputError: { backgroundColor: '#FDAFAF', borderColor: '#e63946' },
  errorText: { color: '#e63946', fontSize: 20 },
  enterButton: { 
    backgroundColor: '#1DA1D9', 
    width: '100%', 
    paddingVertical: 18, 
    borderRadius: 15, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: 10, 
    marginBottom: 30,
    minHeight: 65
  },
  buttonText: { color: '#fff', fontSize: 26, fontFamily: 'Lexend_700Bold' },
  goBackText: { 
    color: '#fff', 
    fontSize: 22, 
    fontFamily: 'Lexend_700Bold', 
    textDecorationLine: 'underline', 
    opacity: 0.9 
  },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainerLarge: { width: '70%', maxWidth: 600, backgroundColor: '#2A2A2A', borderRadius: 30, padding: 60, alignItems: 'center', gap: 20 },
  modalTitleLarge: { color: '#fff', fontSize: 50, fontFamily: 'Lexend_700Bold', textAlign: 'center' },
  modalSubtitleLarge: { color: '#fff', fontSize: 26, textAlign: 'center', fontFamily: 'Lexend_400Regular', lineHeight: 40, marginBottom: 10 },
  
  errorIconContainer: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    padding: 15,
    borderRadius: 50,
    marginBottom: 5
  },
  
  buttonDark: { backgroundColor: '#505050', paddingVertical: 15, width: 350, borderRadius: 15, alignItems: 'center' },
  buttonTextRegular: { color: '#fff', fontSize: 28, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
});