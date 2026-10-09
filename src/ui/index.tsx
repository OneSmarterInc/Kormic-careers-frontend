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
  children: React.ReactNode;
  /** Vertically centres a short screen instead of stacking from the top. */
  centred?: boolean;
  scroll?: boolean;
  wide?: boolean;
}

/** Responsive screens fill the available viewport with consistent gutters. */
export function Screen({ children, centred = false, scroll = true, wide = false }: ScreenProps) {
  const column = (
    <View style={[styles.column, wide && styles.columnWide, !scroll && styles.columnFill, centred && styles.columnCentred]}>{children}</View>
  );

  if (!scroll) {
    return <View style={[styles.page, styles.fixedPage, centred && styles.pageCentred]}>{column}</View>;
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[styles.pageContent, centred && styles.pageCentred]}
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

export function Title({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={type.title}>{children}</Text>;
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
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  block = true,
}: ButtonProps) {
  const inert = disabled || busy;

  if (variant === 'quiet' || variant === 'danger') {
    return (
      <Pressable
        onPress={onPress}
        disabled={inert}
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy }}
        style={({ pressed }) => [
          styles.quiet,
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
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy }}
      style={({ pressed }) => [
        styles.button,
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

export interface DateFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  /** ISO YYYY-MM-DD, or empty. */
  value: string;
  onChange: (value: string) => void;
  /** Latest date that may be picked, ISO. */
  max?: string;
  min?: string;
  accessibilityLabel?: string;
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function readableDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * A date chosen from a calendar, never typed.
 *
 * Typed dates were the failure: "11/02/1984" means two different days in two
 * countries, and a half-typed one was silently dropped from the save. On the
 * web this is the browser's own date input; on a phone it is the platform's
 * picker. Either way the value is always a real day in YYYY-MM-DD.
 */
export function DateField({ label, hint, error, value, onChange, max, min, accessibilityLabel }: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const dateInput = React.useRef<HTMLInputElement | null>(null);

  const control =
    Platform.OS === 'web'
      ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>{React.createElement('input', {
          ref: dateInput,
          type: 'date',
          value,
          max,
          min,
          'aria-label': accessibilityLabel ?? label,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          style: {
            ...webInputStyle,
            borderColor: error ? colors.error : colors.line,
          },
        })}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open date of birth calendar" onPress={() => {
          try { if (dateInput.current?.showPicker) dateInput.current.showPicker(); else dateInput.current?.focus(); } catch { dateInput.current?.focus(); }
        }} style={{ padding: spacing.sm }}><Text style={type.body}>Calendar</Text></Pressable>
      </View>
      : (
          <Pressable
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            style={[styles.input, styles.dateButton, Boolean(error) && styles.inputError]}
          >
            <Text style={[type.body, !value && { color: colors.muted }]}>
              {value ? readableDate(value) : 'Choose a date'}
            </Text>
          </Pressable>
        );

  return (
    <View style={styles.field}>
      {label ? <Text style={type.label}>{label}</Text> : null}
      {control}
      {open && Platform.OS !== 'web' ? (
        <NativeDatePicker
          value={value}
          max={max}
          min={min}
          onDone={(picked) => {
            setOpen(false);
            if (picked) onChange(picked);
          }}
        />
      ) : null}
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={type.caption}>{hint}</Text>
      ) : null}
    </View>
  );
}

function NativeDatePicker({
  value, max, min, onDone,
}: { value: string; max?: string; min?: string; onDone: (picked?: string) => void }) {
  // Required here rather than at the top of the file: the module is native
  // only, and loading it on the web or under the test runner would fail.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DateTimePicker = require('@react-native-community/datetimepicker').default;
  const toDate = (iso?: string) => (iso ? new Date(`${iso}T12:00:00`) : undefined);
  return (
    <DateTimePicker
      mode="date"
      value={toDate(value) ?? toDate(max) ?? new Date(1990, 0, 1)}
      maximumDate={toDate(max)}
      minimumDate={toDate(min)}
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={(event: { type: string }, date?: Date) => {
        onDone(event.type === 'set' && date ? isoDate(date) : undefined);
      }}
    />
  );
}

const webInputStyle = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: radii.input,
  padding: `${spacing.sm + 2}px ${spacing.md}px`,
  color: colors.paper,
  backgroundColor: colors.panel,
  fontFamily: 'Inter_400Regular',
  fontSize: 15,
  minHeight: 48,
  boxSizing: 'border-box',
  width: '100%',
  // Match the browser calendar control to the light theme.
  colorScheme: 'light',
} as const;

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
  pageContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: layout.gutter, paddingVertical: spacing.lg },
  pageCentred: { justifyContent: 'center', alignItems: 'center' },
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
