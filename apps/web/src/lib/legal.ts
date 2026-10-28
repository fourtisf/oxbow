import 'server-only';

/**
 * Values the legal pages need from the operator. Unset ones render as
 * [bracketed placeholders] so a draft can't be mistaken for a final text.
 * The restricted-region list comes from the same GEO_BLOCKED_COUNTRIES the
 * middleware enforces, so the Terms and the block always match.
 */
export const legal = {
  entity: process.env.LEGAL_ENTITY || '[Operator legal name]',
  contact: process.env.LEGAL_CONTACT_EMAIL || '[contact email]',
  law: process.env.LEGAL_GOVERNING_LAW || '[governing law and courts]',
  updated: process.env.LEGAL_UPDATED || '2026-10-28',
};

export function restrictedRegions(): string[] {
  const codes = (process.env.GEO_BLOCKED_COUNTRIES ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  return codes.map((c) => {
    try {
      return names.of(c) ?? c;
    } catch {
      return c;
    }
  });
}
