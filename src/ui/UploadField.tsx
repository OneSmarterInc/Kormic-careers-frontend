import { LineIcon } from './LineIcon';
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Button, Caption } from './index';
import { colors, type } from '../theme/tokens';

export function UploadField({
  title,
  description,
  formats,
  chooseLabel,
  onChoose,
  busy,
  selected,
  error,
  children,
}: {
  title: string;
  description: string;
  formats: string;
  chooseLabel: string;
  onChoose: () => void;
  busy: boolean;
  selected: boolean;
  error?: string;
  children?: React.ReactNode;
}) {
  const compact = useWindowDimensions().width <= 520;
  return (
    <View
      style={[
        styles.box,
        selected && styles.selected,
        compact && { paddingHorizontal: 16, paddingVertical: selected ? 16 : 24 },
        Boolean(error) && { borderColor: colors.error },
      ]}
    >
      {selected ? (
        children
      ) : (
        <View style={styles.empty}>
          <View style={styles.icon}>
            <LineIcon name="upload" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={{ marginTop: 8 }}>
            <Button
              compact
              label={chooseLabel}
              variant="secondary"
              block={false}
              disabled={busy}
              onPress={onChoose}
            />
          </View>
          <Caption>{formats}</Caption>
        </View>
      )}
      {error ? (
        <View style={styles.error}>
          <Text accessibilityRole="alert" style={{ ...type.caption, color: colors.error }}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  box: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    borderRadius: 20,
    backgroundColor: colors.panel,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  selected: { borderStyle: 'solid', borderColor: colors.line, padding: 20 },
  empty: { alignItems: 'center', gap: 10 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.panelRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { ...type.bodyStrong, fontSize: 16 },
  description: { ...type.caption, fontSize: 13, textAlign: 'center' },
  error: {
    backgroundColor: colors.errorWash,
    borderLeftWidth: 2,
    borderLeftColor: colors.error,
    padding: 12,
    marginTop: 16,
  },
});
