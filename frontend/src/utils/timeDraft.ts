// Keep incomplete drafts and deletion editable; validation belongs on submit.
export function formatTimeDraft(value: string, previous = '') {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length < 2) return digits;
  if (digits.length === 2) return value.length >= previous.length ? digits + ':' : digits;
  return digits.slice(0, 2) + ':' + digits.slice(2);
}
