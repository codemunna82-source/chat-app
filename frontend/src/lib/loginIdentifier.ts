/**
 * Catches a sign-in identifier that cannot possibly match, before it is
 * sent.
 *
 * The case this exists for: someone types their number the way they say
 * it — "8210956588" — and the server's normaliser, which prepends a `+`
 * to bare digits, turns that into "+8210956588". That is a syntactically
 * valid E.164 string for a completely different country, so nothing
 * rejects it; it simply matches no account, and the honest constant-shape
 * answer for a failed lookup is "invalid phone number or password".
 *
 * So the person is told their password is wrong when their password was
 * fine. Nothing downstream can tell them otherwise — the server must not
 * reveal whether a number has an account — which makes this the last
 * place the real problem can be named.
 *
 * Returns null when there is nothing to say.
 */
export function describeIdentifierProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // An email is the other thing this field takes, and it is unambiguous.
  if (value.includes('@')) return null;

  // Already carries a country code, one way or the other.
  if (value.startsWith('+') || value.replace(/[\s\-().]/g, '').startsWith('00')) return null;

  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;

  return `Add your country code — ${digits.length === 10 ? `+91${digits}` : `+…${digits}`}, not ${digits}. Without it this is read as a number in another country.`;
}
