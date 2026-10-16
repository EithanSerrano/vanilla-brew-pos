import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab(props) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback on iOS
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        if (props.onPressIn) {
          props.onPressIn(ev);
        }
      }}
    />
  );
}