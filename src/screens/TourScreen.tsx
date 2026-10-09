import React, { useMemo } from 'react';
import {  StyleSheet, Text, View } from 'react-native';
import { CandidateState } from '../models/onboarding';
import { CandidateAction } from '../state/candidateReducer';
import { colors, radii, spacing, type } from '../theme/tokens';
import { Button, Screen } from '../ui';
import { buildTour, stepCountLine, tourPosition } from './tourModel';

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
  const position = tourPosition(stops, index);
  const last = index >= stops.length - 1;

  if (!stop) {
    return (
      <Screen centred scroll={false}>
        <Text style={type.body}>We could not load what this corridor asks for.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.dots} accessibilityLabel={`Part ${position.current} of ${position.total}`}>
        {stops.map((entry, entryIndex) => (
          <View key={entry.key} style={[styles.dot, entryIndex <= index && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.body}>
        <Text style={type.caption}>{stepCountLine(state.corridor)}</Text>
        <Text style={type.title}>{stop.heading}</Text>
        <Text style={type.body}>{stop.body}</Text>

        {stop.items ? (
          <View style={styles.card}>
            {stop.items.map((item) => (
              <Text key={item} style={styles.item}>
                {item}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button label={last ? 'Get started' : 'Next'} onPress={() => last ? dispatch({ type: 'NEXT' }) : setIndex(index + 1)} />
        {index > 0 ? <Button label="Previous" variant="quiet" onPress={() => dispatch({ type: 'BACK' })} /> : null}
        {!last ? <Button label="Skip the tour" variant="quiet" onPress={() => dispatch({ type: 'NEXT' })} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bodyScroll: { flex: 1 },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { height: 4, flex: 1, backgroundColor: colors.line, borderRadius: radii.pill },
  dotOn: { backgroundColor: colors.coral },
  body: { gap: spacing.sm, paddingTop: spacing.lg },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.xs,
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
