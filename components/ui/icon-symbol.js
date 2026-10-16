import MaterialIcons from '@expo-vector-icons/MaterialIcons';

/**
 * SF Symbols to Material Icons mappings.
 * Update these if you change icons in your layout.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}) {
  return (
    <MaterialIcons 
      color={color} 
      size={size} 
      name={MAPPING[name]} 
      style={style} 
    />
  );
}