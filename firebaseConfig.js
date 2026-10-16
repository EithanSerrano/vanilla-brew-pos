// firebaseConfig.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getReactNativePersistence,
  initializeAuth
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyDM32iorEzxNtkpokv4R2WVdZCOGq9AwkA",
  authDomain: "vnlbrewsystem.firebaseapp.com",
  projectId: "vnlbrewsystem",
  storageBucket: "vnlbrewsystem.firebasestorage.app",
  messagingSenderId: "113399496147",
  appId: "1:113399496147:web:48b9214b106dfdedbcc326",
  measurementId: "G-S601KQ7JPX"
};

// Initialize Firebase App instance safely to prevent duplicate instance errors
const isNewApp = getApps().length === 0;
const app = isNewApp ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth persistence based on environment platform
let auth;
if (isNewApp) {
  auth = initializeAuth(app, {
    persistence: Platform.OS === 'web'
      ? browserLocalPersistence
      : getReactNativePersistence(AsyncStorage)
  });
} else {
  auth = getAuth(app);
}

// Initialize and export Cloud Firestore Database reference
export const db = getFirestore(app);
export { auth };

