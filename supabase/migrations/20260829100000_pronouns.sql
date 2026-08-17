-- Optional pronouns field — set during onboarding/edit, shown on the
-- profile viewer when present. No validation on the value (free text, not
-- a fixed list) so it covers anything someone wants to put there.

alter table public.profiles add column pronouns text;
