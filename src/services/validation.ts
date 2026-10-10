import { Person } from '../models/onboarding';

export const personLimits = {
  fullName: 255,
  email: 255,
  phone: 64,
  city: 255,
  region: 255,
  country: 255,
} as const;
export const personWireFields: Record<string, string> = {
  fullName: 'full_name',
  email: 'email',
  phone: 'phone',
  city: 'city',
  region: 'region',
  country: 'country',
};
export function personLimitErrors(person: Person): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, limit] of Object.entries(personLimits)) {
    if (String(person[field as keyof typeof personLimits] ?? '').length > limit)
      errors[personWireFields[field]!] = `Use no more than ${limit} characters.`;
  }
  if ((person.previousNames?.length ?? 0) > 10)
    errors.previous_names = 'Enter no more than 10 previous names.';
  else if (person.previousNames?.some((name) => name.length > 255))
    errors.previous_names = 'Each previous name must be 255 characters or fewer.';
  return errors;
}
