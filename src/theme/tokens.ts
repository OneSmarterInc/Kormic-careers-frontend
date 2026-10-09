import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  /** The page behind everything. Deeper than the cards so they lift off it. */
  ink: '#0E0F24',
  /** Cards and inputs. */
  panel: '#1B1E42',
  /** A card under the pointer, or one carrying the eye. */
  panelRaised: '#232752',
  paper: '#F6F5F1',

  coral: '#FF6B4A', // the person's side
  coralPressed: '#E85736',
  coralWash: 'rgba(255,107,74,0.12)',

  trustBlue: '#5B8DEF', // verification and the org side
  trustWash: 'rgba(91,141,239,0.12)',

  muted: '#8A8BA3',
  textSoft: '#CBCAD9',

  line: 'rgba(255,255,255,0.09)',
  lineStrong: 'rgba(255,255,255,0.20)',

  error: '#FFB09D',
  errorWash: 'rgba(255,176,157,0.10)',
};

export const spacing = { xxs: 4, xs: 6, sm: 10, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radii = { sm: 8, input: 12, card: 18, pill: 999 };

/**
 * One column, bounded.
 *
 * Every screen is a single column of text and controls, and on a desktop
 * browser it was running the full width of the window — profile rows nearly
 * two thousand pixels across, with three words in them. A measure is the
 * difference between a form and a spreadsheet.
 */
export const layout = {
  maxWidth: 560,
  gutter: spacing.lg,
};

export const fonts = {
  heading: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_600SemiBold',
};

export const type = {
  display: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.paper } satisfies TextStyle,
  title: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, color: colors.paper } satisfies TextStyle,
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

/** Cards sit above the page rather than being drawn on it. */
export const elevation = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  } satisfies ViewStyle,
  button: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  } satisfies ViewStyle,
};

/** A pointer on the web, and nothing at all anywhere else. */
export const pointer = Platform.select<ViewStyle>({
  web: { cursor: 'pointer' } as ViewStyle,
  default: {},
});
