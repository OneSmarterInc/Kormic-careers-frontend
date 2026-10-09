import { Platform, TextStyle, ViewStyle } from 'react-native';

// Legacy keys remain compatible with existing screens; ink is the page and paper is text.
export const colors = {
  onPrimary: '#FFFFFF',
  mint: '#D8EADE',
  /** Warm page background. */
  ink: '#F8F9F3',
  /** Cards and inputs. */
  panel: '#FFFEFA',
  /** A card under the pointer, or one carrying the eye. */
  panelRaised: '#EDF3E9',
  paper: '#24352A',

  coral: '#365B48', // the person's side
  coralPressed: '#294735',
  coralWash: '#D8EADE',

  trustBlue: '#3D626A', // verification and the org side
  trustWash: '#E5EFEB',

  muted: '#647063',
  textSoft: '#52634F',

  line: '#DCE2D8',
  lineStrong: '#ABBCA8',

  error: '#973C33',
  errorWash: '#FFF0EB',
};

export const spacing = { xxs: 4, xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radii = { sm: 8, input: 12, card: 22, pill: 999 };

/** Shared viewport gutters; dialogs keep their own readable width. */
export const layout = {
  gutter: spacing.lg,
};

export const fonts = {
  heading: 'Inter_600SemiBold',
  accent: 'Fraunces_600SemiBold_Italic',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_600SemiBold',
};

export const type = {
  display: { fontFamily: fonts.heading, fontSize: 44, lineHeight: 52, color: colors.paper } satisfies TextStyle,
  title: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 38, color: colors.paper } satisfies TextStyle,
  heading: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 25, color: colors.paper } satisfies TextStyle,
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 24, color: colors.textSoft } satisfies TextStyle,
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 24, color: colors.paper } satisfies TextStyle,
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.paper } satisfies TextStyle,
  caption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.muted } satisfies TextStyle,
  /** Small caps-ish eyebrow for section headers. */
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  } satisfies TextStyle,
};

/** Subtle elevation complements the light card borders. */
export const elevation = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 1,
  } satisfies ViewStyle,
  button: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  } satisfies ViewStyle,
};

/** A pointer on the web, and nothing at all anywhere else. */
export const pointer = Platform.select<ViewStyle>({
  web: { cursor: 'pointer' } as ViewStyle,
  default: {},
});
