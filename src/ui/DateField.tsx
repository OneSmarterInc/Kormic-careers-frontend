import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, type } from '../theme/tokens';
import { displayDate, inputDate } from './dateModel';
import { LineIcon } from './LineIcon';

export interface DateFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  /** ISO for valid dates; incomplete input is retained so it cannot submit a stale date. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Latest date that may be picked, ISO. */
  max?: string;
  min?: string;
  accessibilityLabel?: string;
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Consistent typed dates with a calendar; invalid drafts never retain an old valid value. */
export function DateField({
  label,
  hint,
  error,
  value,
  onChange,
  onBlur,
  max,
  min,
  accessibilityLabel,
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const calendar = React.useRef<HTMLDialogElement | null>(null);
  const trigger = React.useRef<React.ElementRef<typeof Pressable>>(null);
  const [month, setMonth] = React.useState(0);
  const [year, setYear] = React.useState(1990);
  const id = React.useId();
  const problem = !editing ? error : undefined;
  const years = Array.from(
    { length: Number(max?.slice(0, 4) || new Date().getFullYear()) - Number(min?.slice(0, 4) || 1900) + 1 },
    (_, n) => Number(max?.slice(0, 4) || new Date().getFullYear()) - n,
  );
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  function choose(iso: string) {
    onChange(iso);
    setEditing(false);
    onBlur?.();
    calendar.current?.close();
  }

  return (
    <View style={styles.field}>
      {label ? <Text style={type.label}>{label}</Text> : null}
      <View
        style={[
          styles.input,
          { paddingVertical: 0, paddingRight: 0, flexDirection: 'row', alignItems: 'center' },
          Boolean(problem) && styles.inputError,
        ]}
      >
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          nativeID={id}
          value={displayDate(value)}
          placeholder="MM-DD-YYYY"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          onFocus={() => setEditing(true)}
          onBlur={() => {
            setEditing(false);
            onBlur?.();
          }}
          onChangeText={(text) => onChange(inputDate(text) ?? (text ? `draft:${text}` : ''))}
          style={{ ...type.body, flex: 1, minWidth: 0, height: 48, color: colors.paper }}
          {...(Platform.OS === 'web'
            ? { 'aria-describedby': `${id}-hint ${id}-error`, 'aria-invalid': Boolean(problem) }
            : {})}
        />
        <Pressable
          ref={trigger}
          accessibilityRole="button"
          accessibilityLabel="Open date of birth calendar"
          style={{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }}
          onPress={() => {
            setEditing(false);
            if (Platform.OS !== 'web') {
              setOpen(true);
              return;
            }
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : max || '1990-01-01';
            setYear(Number(iso.slice(0, 4)));
            setMonth(Number(iso.slice(5, 7)) - 1);
            calendar.current?.showModal();
          }}
        >
          <LineIcon name="calendar" />
        </Pressable>
      </View>
      <Text nativeID={`${id}-hint`} style={[type.caption, { fontSize: 11 }]}>
        MM-DD-YYYY · {hint}
      </Text>
      {problem ? (
        <Text nativeID={`${id}-error`} accessibilityRole="alert" style={styles.fieldError}>
          {problem}
        </Text>
      ) : null}
      {Platform.OS === 'web'
        ? React.createElement(
            'dialog',
            {
              ref: calendar,
              'aria-label': 'Date of birth',
              onClose: () => (trigger.current as unknown as { focus?: () => void })?.focus?.(),
              style: {
                border: `1px solid ${colors.line}`,
                borderRadius: 18,
                background: colors.panel,
                color: colors.paper,
                padding: 22,
                fontFamily: 'Inter_400Regular, sans-serif',
                width: 400,
                maxWidth: 'calc(100% - 24px)',
                boxSizing: 'border-box',
              },
            },
            React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 15,
                },
              },
              React.createElement('strong', null, 'Date of birth'),
              React.createElement(
                'button',
                {
                  type: 'button',
                  'aria-label': 'Close date picker',
                  onClick: () => calendar.current?.close(),
                  style: {
                    minHeight: 44,
                    minWidth: 44,
                    background: 'transparent',
                    border: 0,
                    color: colors.coral,
                  },
                },
                '✕',
              ),
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: 7, marginBottom: 10 } },
              React.createElement(
                'select',
                {
                  'aria-label': 'Month',
                  value: month,
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setMonth(+e.target.value),
                  style: webInputStyle,
                },
                months.map((name, n) => React.createElement('option', { value: n, key: name }, name)),
              ),
              React.createElement(
                'select',
                {
                  'aria-label': 'Year',
                  value: year,
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setYear(+e.target.value),
                  style: webInputStyle,
                },
                years.map((y) => React.createElement('option', { value: y, key: y }, y)),
              ),
            ),
            React.createElement(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 } },
              ...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) =>
                React.createElement(
                  'span',
                  { key: day, style: { textAlign: 'center', fontSize: 11, padding: 5 } },
                  day,
                ),
              ),
              ...Array.from({ length: new Date(year, month, 1).getDay() }, (_, i) =>
                React.createElement('span', { key: `blank${i}` }),
              ),
              ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                const disabled = Boolean((max && iso > max) || (min && iso < min));
                return React.createElement(
                  'button',
                  {
                    key: iso,
                    type: 'button',
                    disabled,
                    'aria-label': `${months[month]} ${i + 1}, ${year}`,
                    'aria-pressed': iso === value,
                    onClick: () => choose(iso),
                    style: {
                      minHeight: 38,
                      border: 0,
                      borderRadius: 8,
                      background: iso === value ? colors.coral : 'transparent',
                      color: iso === value ? 'white' : colors.paper,
                      opacity: disabled ? 0.35 : 1,
                      cursor: disabled ? 'default' : 'pointer',
                    },
                  },
                  i + 1,
                );
              }),
            ),
            React.createElement(
              'p',
              { style: { fontSize: 11, color: colors.muted } },
              'Choose a date or type MM-DD-YYYY in the field.',
            ),
          )
        : null}
      {open && Platform.OS !== 'web' ? (
        <NativeDatePicker
          value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
          max={max}
          min={min}
          onDone={(picked) => {
            setOpen(false);
            if (picked) {
              onChange(picked);
              onBlur?.();
            }
          }}
        />
      ) : null}
    </View>
  );
}

function NativeDatePicker({
  value,
  max,
  min,
  onDone,
}: {
  value: string;
  max?: string;
  min?: string;
  onDone: (picked?: string) => void;
}) {
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

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    backgroundColor: colors.panel,
    paddingLeft: 13,
  },
  inputError: { borderColor: colors.error },
  fieldError: { ...type.caption, color: colors.error },
});
