import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, StatusBar, UIManager } from 'react-native';
import 'react-native-reanimated';

// Firebase
import '../firebaseConfig';

// Theme Context
import { AuthProvider } from '../constants/AuthContext';
import { ThemeProvider } from '../constants/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

SplashScreen.preventAutoHideAsync();

const slideFromRight = {
  animation: 'spring',
  config: {
    stiffness: 1000,
    damping: 80,
    mass: 3,
    overshootClamping: true,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  },
};

const screenOptions = {
  headerShown: false,
  animation: 'slide_from_right',
  animationDuration: 300,
  gestureEnabled: true,
  transitionSpec: {
    open: slideFromRight,
    close: slideFromRight,
  },
  cardStyleInterpolator: ({ current, next, layouts }) => ({
    cardStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.width, 0],
          }),
        },
      ],
      opacity: current.progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.8, 1],
      }),
    },
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.3],
      }),
    },
  }),
};

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <AuthProvider>
    <ThemeProvider>
      <StatusBar hidden={true} />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="home" />
        <Stack.Screen name="sales" />
        <Stack.Screen name="help" />
        <Stack.Screen name="about" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="forgot-password" />
      </Stack>
    </ThemeProvider>
    </AuthProvider>
  );
}