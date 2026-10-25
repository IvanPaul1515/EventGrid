import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js/max';
export function formatPhone(value: string) {
  const clean = value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (clean.startsWith('+1') && clean.length > 2) return '+1 ' + new AsYouType('US').input(clean.slice(2));
  return new AsYouType('DO').input(clean);
}
export function normalizedPhone(value: string) {
  if (!value.trim()) return '';
  const parsed = parsePhoneNumberFromString(value, 'DO');
  return parsed?.isValid() ? parsed.number : null;
}
