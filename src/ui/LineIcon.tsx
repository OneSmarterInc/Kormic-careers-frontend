import React from 'react';
import { Platform, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

/** The small outline icons used by the approved onboarding preview. */
export function LineIcon({ name }: { name: 'upload' | 'calendar' | 'lock' }) {
  if (Platform.OS === 'web') {
    const paths =
      name === 'upload'
        ? ['M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4']
        : name === 'calendar'
          ? [
              'M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
              'M8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 3h2',
            ]
          : ['M5 10h14v11H5Z', 'M8 10V7a4 4 0 0 1 8 0v3'];
    return React.createElement(
      'svg',
      {
        width: 22,
        height: 22,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: colors.coral,
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      ...paths.map((d, i) => React.createElement('path', { d, key: i })),
    );
  }
  return (
    <View
      accessibilityElementsHidden
      style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 22, color: colors.coral }}>
        {name === 'upload' ? '↑' : name === 'calendar' ? '▦' : '◇'}
      </Text>
    </View>
  );
}
