import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { colors, elevation, layout, pointer, radii, spacing, type } from '../theme/tokens';

/**
 * The pieces every screen is built from.
 *
 * They exist so a button looks and behaves the same everywhere without each
 * screen restating it, and so states that were previously invisible — pressed,
 * busy, disabled, focused — are part of the component rather than something a
 * screen remembers to add.
 */

// --- layout ---------------------------------------------------------------

interface ScreenProps {
  onboarding?: boolean;
  children: React.ReactNode;
  /** Vertically centres a short screen instead of stacking from the top. */
  centred?: boolean;
  scroll?: boolean;
  wide?: boolean;
  contentWidth?: number;
  compactSpacing?: boolean;
  showsVerticalScrollIndicator?: boolean;
}

/** Task-sized content columns with responsive gutters and natural vertical flow. */
export function Screen({ children, centred = false, scroll = true, wide = false, contentWidth, compactSpacing = false, showsVerticalScrollIndicator = true, onboarding = false }: ScreenProps) {
  const { width } = useWindowDimensions();
  const gutter = width < (onboarding ? 760 : 600) ? spacing.md : layout.gutter;
  const column = (
    <View style={[styles.column, { maxWidth: contentWidth ?? (wide ? layout.profile : layout.content) }, !scroll && styles.columnFill, centred && styles.columnCentred]}>{children}</View>
  );

  if (!scroll) {
    return <View style={[styles.page, styles.fixedPage, { paddingHorizontal: gutter }, centred && styles.pageCentred]}>{column}</View>;
  }

  return (
    <ScrollView
      style={styles.page}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      contentContainerStyle={[styles.pageContent, onboarding && { paddingTop: width <= 760 ? 24 : 30, paddingBottom: width <= 520 ? 24 : 36 }, compactSpacing && { paddingTop: spacing.md, paddingBottom: spacing.lg }, { paddingHorizontal: gutter }, centred && styles.pageCentred]}
      keyboardShouldPersistTaps="handled"
    >
      {column}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Stack({ children, gap = spacing.md }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ gap }}>{children}</View>;
}

// --- text -----------------------------------------------------------------

export function Title({ children, onboarding = false }: { children: React.ReactNode; onboarding?: boolean }) {
  const compact = useWindowDimensions().width <= 760;
  return <Text accessibilityRole="header" style={[type.title, onboarding && { fontSize: compact ? 27 : 30, lineHeight: compact ? 34 : 38, letterSpacing: -0.8 }]}>{children}</Text>;
}

export function Body({ children }: { children: React.ReactNode }) {
  return <Text style={type.body}>{children}</Text>;
}

export function Caption({ children }: { children: React.ReactNode }) {
  return <Text style={type.caption}>{children}</Text>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={type.eyebrow}>{children}</Text>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

// --- dialogs --------------------------------------------------------------

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Colours the confirm red and puts it second, so it is not the resting choice. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A decision that deserves a stop.
 *
 * Sign-out used to expand a line of text underneath the link, which reads as
 * more page rather than as a question, and leaves the rest of the screen live
 * behind it. A destructive action wants the interface to hold still and ask.
 *
 * The safe choice is on the left and is the wider target; the destructive one
 * is plainly coloured rather than hidden. Neither is preselected, because a
 * dialog that answers itself is not asking.
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onCancel}
      accessibilityViewIsModal
    >
      {/* The scrim dismisses, which is the same as cancelling — except while
          the action is running, when there is nothing safe to dismiss to. */}
      <Pressable style={styles.scrim} onPress={busy ? undefined : onCancel} accessibilityRole="button">
        <Pressable style={styles.dialog} onPress={() => {}} accessibilityViewIsModal>
          <Text style={type.heading}>{title}</Text>
          {body ? <Text style={type.body}>{body}</Text> : null}

          <View style={styles.dialogActions}>
            <View style={styles.dialogAction}>
              <Button label={cancelLabel} onPress={onCancel} variant="secondary" disabled={busy} />
            </View>
            <View style={styles.dialogAction}>
              <Button
                label={confirmLabel}
                onPress={onConfirm}
                variant={destructive ? 'destructive' : 'primary'}
                busy={busy}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --- controls -------------------------------------------------------------

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'destructive';
  busy?: boolean;
  disabled?: boolean;
  /** Fills the width. Primary actions do; inline ones do not. */
  block?: boolean;
  compact?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  block = true,
  compact = false,
}: ButtonProps) {
  const inert = disabled || busy;
  const [focused, setFocused] = React.useState(false);
  const focusStyle = Platform.OS === 'web' && focused ? { outlineStyle: 'solid', outlineWidth: 2, outlineColor: colors.coral, outlineOffset: 3 } as ViewStyle : undefined;

  if (variant === 'quiet' || variant === 'danger') {
    return (
      <Pressable
        onPress={onPress}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        disabled={inert}
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy }}
        style={({ pressed }) => [
          styles.quiet, focusStyle,
          block && styles.quietBlock,
          pointer,
          pressed && styles.quietPressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.coral} />
        ) : (
          <Text
            style={[
              variant === 'danger' ? styles.dangerLabel : styles.quietLabel,
              inert && styles.inertLabel,
            ]}
          >
            {label}
          </Text>
        )}
      </Pressable>
    );
  }

  const isPrimary = variant === 'primary';
  const isDestructive = variant === 'destructive';
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy }}
      style={({ pressed }) => [
        styles.button, focusStyle,
        compact && { minHeight: 48, paddingVertical: 12 },
        isDestructive ? styles.destructive : isPrimary ? styles.primary : styles.secondary,
        (isPrimary || isDestructive) && !inert && elevation.button,
        block && styles.block,
        pointer,
        pressed &&
          (isDestructive
            ? styles.destructivePressed
            : isPrimary
              ? styles.primaryPressed
              : styles.secondaryPressed),
        inert && styles.inert,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary || isDestructive ? colors.onPrimary : colors.paper} />
      ) : (
        <Text style={isPrimary || isDestructive ? styles.primaryLabel : styles.secondaryLabel}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  locked?: boolean;
}

/**
 * A labelled input. The focus ring is the point: the previous inputs gave no
 * indication at all of which one the keyboard was talking to.
 */
export function Field({ label, hint, error, locked, style, ...input }: FieldProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={styles.field}>
      {label ? <Text style={type.label}>{label}</Text> : null}
      <TextInput
        {...input}
        editable={input.editable ?? !locked}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          focused && styles.inputFocused,
          Boolean(error) && styles.inputError,
          locked && styles.inputLocked,
          style,
        ]}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={type.caption}>{hint}</Text>
      ) : null}
    </View>
  );
}

export { DateField } from './DateField';
export type { DateFieldProps } from './DateField';

export interface CheckFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  error?: string;
  accessibilityLabel?: string;
}

/** A box the person ticks themselves. Never pre-ticked by the app. */
export function CheckField({ checked, onChange, children, error, accessibilityLabel }: CheckFieldProps) {
  return (
    <View style={styles.field}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.check, pressed && styles.choicePressed]}
      >
        <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
          {checked ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <View style={styles.checkText}>{children}</View>
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface ChoiceFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  value?: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
}

/**
 * A list of options, one selectable.
 *
 * Rows rather than a dropdown: a native picker renders differently on iOS,
 * Android and web, and the options here are load-bearing — the value chosen is
 * matched against a register directory, so a person needs to see what they
 * picked without opening anything.
 */
export function ChoiceField({ label, hint, error, value, options, onChange }: ChoiceFieldProps) {
  return (
    <View style={styles.field}>
      {label ? <Text style={type.label}>{label}</Text> : null}
      <View style={styles.choices}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={({ pressed }) => [
                styles.choice,
                selected && styles.choiceSelected,
                pressed && styles.choicePressed,
              ]}
            >
              <View style={[styles.choiceDot, selected && styles.choiceDotOn]} />
              <Text style={[type.body, selected && type.bodyStrong]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={type.caption}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** A coloured status line: blue when checked, coral when it wants attention. */
export function StatusLine({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'checked' | 'attention';
}) {
  return (
    <Text
      style={[
        type.caption,
        tone === 'checked' && { color: colors.trustBlue },
        tone === 'attention' && { color: colors.error },
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.ink },
  pageContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: layout.gutter, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  pageCentred: { justifyContent: 'flex-start', alignItems: 'center' },
  column: { width: '100%', gap: spacing.md },
  columnCentred: { gap: spacing.lg, justifyContent: 'center' },
  columnWide: { width: '100%' },
  columnFill: { flex: 1 },
  fixedPage: { alignItems: 'center', padding: layout.gutter },

  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    ...elevation.card,
  },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.sm },

  button: {
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  block: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.coral },
  primaryPressed: { backgroundColor: colors.coralPressed, transform: [{ scale: 0.985 }] },
  primaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.onPrimary, textAlign: 'center' },
  destructive: { backgroundColor: colors.error },
  destructivePressed: { backgroundColor: '#7F3029', transform: [{ scale: 0.985 }] },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.lineStrong },
  secondaryPressed: { backgroundColor: colors.panelRaised },
  secondaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.paper },
  inert: { opacity: 0.45 },

  quiet: { minHeight: 44, justifyContent: 'center', paddingVertical: spacing.sm, alignItems: 'center' },
  quietBlock: { alignSelf: 'stretch' },
  quietPressed: { opacity: 0.6 },
  quietLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: colors.coral },
  dangerLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: colors.error },
  inertLabel: { color: colors.muted },

  field: { gap: spacing.xs },
  choices: { gap: spacing.xs },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...pointer,
  },
  choiceSelected: { borderColor: colors.coral, backgroundColor: colors.panelRaised },
  choicePressed: { opacity: 0.85 },
  choiceDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.line,
  },
  choiceDotOn: { borderColor: colors.coral, backgroundColor: colors.coral },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.paper,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    backgroundColor: colors.panel,
    minHeight: 48,
  },
  inputFocused: { borderColor: colors.coral, backgroundColor: colors.panelRaised },
  inputError: { borderColor: colors.error },
  inputLocked: { color: colors.muted, borderStyle: 'dashed', backgroundColor: 'transparent' },
  fieldError: { ...type.caption, color: colors.error },
  dateButton: { justifyContent: 'center' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkBoxOn: { borderColor: colors.coral, backgroundColor: colors.coral },
  checkMark: { color: colors.onPrimary, fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 16 },
  checkText: { flex: 1 },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(6,7,20,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.panel,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.card,
    shadowOpacity: 0.5,
    shadowRadius: 32,
  },
  dialogActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  dialogAction: { flex: 1 },

  errorBox: {
    backgroundColor: colors.errorWash,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.error,
  },
  errorText: { ...type.caption, color: colors.error },
});
