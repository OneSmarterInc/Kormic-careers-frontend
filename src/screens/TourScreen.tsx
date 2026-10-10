import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CandidateState } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { colors, radii, spacing, type } from '../theme/tokens';
import { ScreenActions } from '../ui/ScreenActions';
import { Button, Eyebrow, Screen, Title } from '../ui';
import { buildTour, stepCountLine } from './tourModel';

interface Props {
  state: CandidateState;
  dispatch: (action: CandidateAction) => void;
}

/**
 * Shown before anyone signs on, so the person knows what they are agreeing to
 * walk. Skippable at any point, and reachable again later.
 */
export function TourScreen({ state, dispatch }: Props) {
  const stops = useMemo(() => buildTour(state.corridor), [state.corridor]);
  const index = Math.min(state.tourIndex ?? 0, Math.max(0, stops.length - 1));
  const setIndex = (index: number) => dispatch({ type: 'SET_TOUR_INDEX', index });
  const stop = stops[index];

  const last = index >= stops.length - 1;

  if (!stop) {
    return (
      <Screen centred scroll={false}>
        <Text style={type.body}>We could not load what this corridor asks for.</Text>
      </Screen>
    );
  }

  return (
    <Screen onboarding>
      <View style={styles.body}>
        <Eyebrow>A clear path to your profile</Eyebrow>
        <Title onboarding>{stop.heading}</Title>
        {stop.key !== 'steps' ? <Text style={type.caption}>{stepCountLine(state.corridor)}</Text> : null}
        <Text style={type.body}>{stop.body}</Text>

        {stop.items ? (
          <View style={styles.card}>
            {stop.items.map((item, index) => (
              <View
                key={item}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderTopWidth: index ? 1 : 0,
                  borderColor: colors.line,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: colors.panelRaised,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={type.caption}>{index + 1}</Text>
                </View>
                <Text style={[styles.item, { flex: 1 }]}>
                  {stop.key === 'steps' ? item.replace(/ \(optional\)$/, '') : item}
                </Text>
                {stop.key === 'steps' ? (
                  <Text style={[type.caption, { fontSize: 11 }]}>
                    {item.endsWith('(optional)') ? 'Optional' : 'Required'}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <ScreenActions>
        <Button
          compact
          label={last ? 'Get started' : 'Next'}
          onPress={() => (last ? dispatch({ type: 'NEXT' }) : setIndex(index + 1))}
        />
        {!last ? (
          <Button compact label="Skip the tour" variant="quiet" onPress={() => dispatch({ type: 'NEXT' })} />
        ) : null}
      </ScreenActions>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyScroll: { flex: 1 },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { height: 4, flex: 1, backgroundColor: colors.line, borderRadius: radii.pill },
  dotOn: { backgroundColor: colors.coral },
  body: { gap: spacing.sm },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 20,
    paddingVertical: 5,
    gap: 0,
    marginTop: spacing.sm,
  },
  item: { ...type.body, color: colors.paper },
  footer: { gap: spacing.sm },
  primary: {
    backgroundColor: colors.coral,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.onPrimary },
  skip: { ...type.caption, textAlign: 'center', textDecorationLine: 'underline' },
});
