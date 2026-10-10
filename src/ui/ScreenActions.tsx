import React from 'react';
import { View, useWindowDimensions } from 'react-native';

/** Shared onboarding action width and alignment from the approved preview. */
export function ScreenActions({
  children,
  align = 'center',
}: {
  children: React.ReactNode;
  align?: 'center' | 'end';
}) {
  const compact = useWindowDimensions().width <= 520;
  return (
    <View
      style={{
        marginTop: 8,
        gap: 6,
        alignSelf: align === 'end' ? 'flex-end' : 'center',
        width: compact ? '100%' : 260,
      }}
    >
      {children}
    </View>
  );
}
