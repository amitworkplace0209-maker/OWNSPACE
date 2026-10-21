-- 029 — MPIN only: drop the WebAuthn / passkey tables
--
-- What this removes
-- ------------------
-- Biometric unlock was built on WebAuthn, which on a phone means the platform
-- showed a passkey sheet rather than a plain fingerprint prompt. That is a
-- different product from "ask for my MPIN": it enrols a device key that lives
-- forever, it adds a second way into the account, and on the platforms where it
-- worked it was the passkey dialog — not the biometric the user asked for.
--
-- So the whole credential path is gone, and the MPIN is the only lock:
--
--   * `webauthn_credentials` — public keys and clone counters
--   * `webauthn_challenges` — single-use enrolment/authentication challenges
--   * `user_security.biometric_enabled` — the mirror flag for the lock screen
--
-- Nothing about the MPIN changes. `user_security` keeps its hash, salt, attempt
-- counter and lockout, and `user_security_pin_required` still refuses a lock
-- with no hash behind it.
--
-- Offline unlocking
-- -----------------
-- The MPIN is now also derived on each device with PBKDF2 (WebCrypto) and kept
-- in `localStorage`, so the lock screen opens with no connection. That copy is
-- per-device by nature and needs no table — it is written when the MPIN is set
-- or changed, and deleted on sign-out. The account row stays authoritative, and
-- still holds the lockout counter that a purely local check could not.
--
-- Order matters for re-runnability: the policies and triggers are dropped before
-- their tables, because a table that has already gone cannot be altered.

begin;

-- ---------------------------------------------------------------------------
-- 1. Policies, indexes and triggers
-- ---------------------------------------------------------------------------

drop policy if exists "webauthn_credentials_owner_all" on public.webauthn_credentials;
drop policy if exists "webauthn_credentials_owner_read" on public.webauthn_credentials;
drop policy if exists "webauthn_challenges_owner_all" on public.webauthn_challenges;

drop index if exists public.webauthn_credentials_user_idx;
drop index if exists public.webauthn_challenges_expiry_idx;

drop trigger if exists set_updated_at on public.webauthn_challenges;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

drop table if exists public.webauthn_credentials;
drop table if exists public.webauthn_challenges;

-- ---------------------------------------------------------------------------
-- 3. The biometric flag
-- ---------------------------------------------------------------------------

-- `if exists` because 028 may never have been applied on this deployment, in
-- which case there is nothing to remove and the migration should still succeed.
alter table public.user_security
  drop column if exists biometric_enabled;

comment on table public.user_security is
  'App-lock settings per user: MPIN (scrypt-hashed) and lockout state. The MPIN is the only unlock method; a device-local PBKDF2 copy additionally allows unlocking offline.';

commit;