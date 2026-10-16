import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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

import { LinearGradient } from 'expo-linear-gradient'; // ADDED THIS IMPORT
import { confirmPasswordReset } from 'firebase/auth';
import { auth } from '../firebaseConfig';

export default function CustomResetPasswordScreen() {
  const router = useRouter();
  const { oobCode } = useLocalSearchParams(); 

  // --- DYNAMIC SCALING ---
  const { width } = useWindowDimensions();
  const isTablet = width > 600;
  const scaleRatio = Math.min(width / 1180, 1); 
  const s = (size) => Math.max(Math.round(size * scaleRatio), 1); 

  const styles = useMemo(() => getStyles(s, isTablet), [width, isTablet]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  let [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_700Bold,
    Lexend_900Black,
  });

  if (!fontsLoaded) {
    return (
      <LinearGradient colors={['#d4a07a', '#7a3018']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </LinearGradient>
    );
  }

  if (!oobCode) {
    return (
      <LinearGradient colors={['#d4a07a', '#7a3018']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <View style={styles.keyboardView}>
            <View style={[styles.loginCard, isTablet && styles.tabletCard]}>
               <Text style={styles.instructionTitle}>Invalid Link</Text>
               <Text style={styles.instructionSub}>No secure reset code was found. Please request a new password reset link from the login screen.</Text>
               
               <TouchableOpacity style={styles.buttonReturn} onPress={() => router.replace('/')}>
                  <Text style={styles.buttonReturnText}>Return to Login</Text>
               </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const handleFinalReset = async () => {
    setFormError('');

    if (newPassword.trim() === '' || confirmPassword.trim() === '') {
      setFormError('Please fill out both fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    
    // --- NEW VALIDATION: Password 8-64 characters ---
    if (newPassword.length < 8 || newPassword.length > 64) {
      setFormError('Password must be between 8 and 64 characters.');
      return;
    }

    setLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
    } catch (error) {
      console.error("Password Confirmation Error: ", error);
      if (error.code === 'auth/expired-action-code') {
        setFormError('This reset link has expired. Please request a new one.');
      } else if (error.code === 'auth/invalid-action-code') {
        setFormError('This reset link is invalid or has already been used.');
      } else if (error.code === 'auth/weak-password') {
        setFormError('The password you entered is too weak.');
      } else {
        setFormError('An unexpected error occurred: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // --- HEAVY-DUTY DEEP LINK LOGIC ---
  const handleReturnToApp = () => {
    if (Platform.OS === 'web') {
      const host = window.location.host; 
      
      window.location.href = `exp://${host}`;
      
      setTimeout(() => {
        window.location.href = 'vanillabrew://';
      }, 500);

      setTimeout(() => {
        router.replace('/');
      }, 2500);
    } else {
      router.replace('/');
    }
  };

  return (
    <LinearGradient colors={['#d4a07a', '#7a3018']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <View style={[styles.loginCard, isTablet && styles.tabletCard]}>
            <View style={styles.headerRow}>
              <Image source={require('../assets/images/company-logo1.png')} style={styles.logoImage} resizeMode="contain" />
              <Image source={require('../assets/images/sms-logo1.png')} style={styles.logoImage} resizeMode="contain" />
            </View>

            {success ? (
              <>
                <Text style={styles.instructionTitle}>Password Reset Complete!</Text>
                <Text style={styles.instructionSub}>Your password has been successfully updated. You can now return to the app and log in using your new credentials.</Text>
                <TouchableOpacity style={styles.buttonSubmit} onPress={handleReturnToApp}>
                  <Text style={styles.buttonSubmitText}>Open Vanilla Brew App</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.instructionTitle}>Create New Password</Text>
                <Text style={styles.instructionSub}>Secure link verified. Please enter your new password below.</Text>

                {formError !== '' && (
                  <Text style={styles.errorBanner}>{formError}</Text>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>New Password</Text>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={(text) => { setNewPassword(text); setFormError(''); }}
                    secureTextEntry
                    placeholderTextColor="#AAAAAA"
                    editable={!loading}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(text) => { setConfirmPassword(text); setFormError(''); }}
                    secureTextEntry
                    placeholderTextColor="#AAAAAA"
                    editable={!loading}
                  />
                </View>

                <TouchableOpacity style={styles.buttonSubmit} activeOpacity={0.8} onPress={handleFinalReset} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.buttonSubmitText}>Save Password</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const getStyles = (s, isTablet) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' }, 
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  keyboardView: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: s(20) },
  
  // White Card Layout
  loginCard: { backgroundColor: '#FBFBFB', borderRadius: s(25), padding: s(30), width: '100%', maxWidth: s(450), alignItems: 'center', elevation: s(10) },
  tabletCard: { maxWidth: s(550), padding: s(40) }, 
  
  headerRow: { flexDirection: 'row', justifyContent: 'center', gap: s(25), alignItems: 'center', width: '100%', marginBottom: s(20) },
  logoImage: { width: s(140), height: s(75) }, 
  
  instructionTitle: { color: '#000000', fontSize: s(24), fontFamily: 'Lexend_700Bold', textAlign: 'center', marginBottom: s(8) },
  instructionSub: { color: '#5C3A21', fontSize: s(16), fontFamily: 'Lexend_400Regular', textAlign: 'center', marginBottom: s(20), paddingHorizontal: s(10), lineHeight: s(24) },
  
  errorBanner: { color: '#DF0C0C', backgroundColor: '#FFB2B2', padding: s(12), borderRadius: s(10), width: '100%', textAlign: 'center', fontFamily: 'Lexend_700Bold', fontSize: s(16), marginBottom: s(15) },
  
  inputGroup: { width: '100%', marginBottom: s(15), alignItems: 'flex-start' },
  label: { color: '#000000', fontSize: s(20), fontFamily: 'Lexend_700Bold', marginBottom: s(8) },
  input: { backgroundColor: '#FFFFFF', width: '100%', height: s(55), borderRadius: s(12), paddingHorizontal: s(20), fontSize: s(18), color: '#000000', fontFamily: 'Lexend_400Regular', borderWidth: s(1), borderColor: '#AAAAAA' },
  
  // Submit / Save Action
  buttonSubmit: { backgroundColor: '#AD725B', width: '100%', paddingVertical: s(15), borderRadius: s(12), alignItems: 'center', justifyContent: 'center', marginTop: s(10), marginBottom: s(10), minHeight: s(55) },
  buttonSubmitText: { color: '#FFFFFF', fontSize: s(20), fontFamily: 'Lexend_700Bold' },
  
  // Return / Cancel Action
  buttonReturn: { backgroundColor: '#A34A3B', width: '100%', paddingVertical: s(15), borderRadius: s(12), alignItems: 'center', justifyContent: 'center', marginTop: s(10), marginBottom: s(10), minHeight: s(55) },
  buttonReturnText: { color: '#FFFFFF', fontSize: s(20), fontFamily: 'Lexend_700Bold' },
});