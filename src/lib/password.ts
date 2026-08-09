// Shared by sign-in's set-password step and change-password — one place to
// keep the rules in sync instead of two copies drifting apart.
export function passwordError(password: string): string | null {
  if (password.length < 8) return 'at least 8 characters.';
  if (/\s/.test(password)) return 'no spaces.';
  if (!/[a-z]/.test(password)) return 'add a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'add an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'add a number.';
  return null;
}
