import { TextStyle } from 'react-native';

export const colors = {
  ink: '#12132A',
  panel: '#1E2145',
  paper: '#F6F5F1',
  coral: '#FF6B4A', // the person's side
  trustBlue: '#5B8DEF', // verification and the org side
  muted: '#8A8BA3',
  textSoft: '#CBCAD9',
  line: 'rgba(255,255,255,0.10)',
  error: '#FFB09D',
};

export const spacing = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

export const radii = { input: 12, card: 20, pill: 999 };

export const fonts = {
  heading: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_600SemiBold',
};

export const type = {
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32, color: colors.paper } satisfies TextStyle,
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.textSoft } satisfies TextStyle,
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.paper } satisfies TextStyle,
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.muted } satisfies TextStyle,
};
