// constants/ThemeContext.js
// ------------------------------------------------------------------
// Global theme context – wraps the whole app so every screen can
// read/set the active theme without prop-drilling or local state.
// ------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Platform, UIManager, useWindowDimensions } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ThemeContext = createContext({
  appTheme: 'light',
  setAppTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [appTheme, setAppThemeState] = useState('light');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  const { width } = useWindowDimensions();

  // On first mount, load any previously saved preference
  useEffect(() => {
    AsyncStorage.getItem('appTheme').then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        setAppThemeState(saved);
      }
    });
  }, []);

  const setAppTheme = (theme) => {
    Animated.timing(slideAnim, {
      toValue: -screenWidth,
      duration: 250,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setAppThemeState(theme);
      AsyncStorage.setItem('appTheme', theme);
      slideAnim.setValue(screenWidth);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  };

  return (
    <ThemeContext.Provider value={{ appTheme, setAppTheme }}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
        {children}
      </Animated.View>
    </ThemeContext.Provider>
  );
}

// Convenience hook – import and call in any screen
export function useAppTheme() {
  return useContext(ThemeContext);
}