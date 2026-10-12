-- 028 — MPIN app lock and WebAuthn biometrics
--
-- What this adds
-- --------------
-- Two related but separate things, kept in separate tables because they have
-- different lifetimes and different blast radii:
--
--   * `user_security` — one row per user: whether the app lock is on, the MPIN
--     as a salted scrypt hash, and the failed-attempt counter.
--   * `webauthn_credentials` — one row per enrolled device key.
--
-- Why the MPIN is hashed and salted, and never stored
-- ---------------------------------------------------
-- An MPIN is four to six digits. Storing it, even hashed with a bare SHA-256,
-- is close to storing it: ten thousand candidates, six digits, and anyone with
-- read access to the row can try them all in well under a second. So:
--
--   * the hash is scrypt (memory-hard, in `node:crypto`) with a 16-byte random
--     salt per user, never a fixed one;
--   * there is no column anywhere that holds the PIN itself, its length, or a
--     checksum that would narrow a brute force;
--   * verification is constant-time, so the app cannot be used as an oracle for
--     "how many digits did I get right".
--
-- The digest is produced in the server action rather than in SQL so the
-- algorithm and its parameters live in one reviewable place instead of being
-- spread across a trigger and an action.
--
-- Failed attempts
-- ----------------
-- `failed_attempts` and `locked_until` live beside the hash so a six-digit PIN
-- cannot be walked in a loop by a script hammering the unlock endpoint. After
-- `MAX_ATTEMPTS` the row locks until `locked_until`, and clearing it means going
-- through Supabase's own password-reset email — an attacker with the PIN but no
-- access to the mailbox still cannot walk it, which a plain "forgot MPIN" link
-- would have allowed.
--
-- Biometric
-- ---------
-- WebAuthn keeps the private key inside the device's secure hardware (Secure
-- Enclave, StrongBox, TPM). The server stores only the public key and a
-- signature counter, so a database dump yields nothing that can unlock anything.
-- `credential_id` is the base64url id the authenticator chose and is unique
-- across the whole table — it is looked up by it, so the primary key is a
-- surrogate and a collision between two users' authenticators cannot overwrite
-- one with the other.

begin;

-- ---------------------------------------------------------------------------
-- 1. Per-user security state
-- ---------------------------------------------------------------------------

create table if not exists public.user_security (
  user_id     uuid primary key references auth.users (id) on delete cascade,

  -- The app lock is off until the user turns it on. A column rather than "row
  -- present or not" so the row can exist with no PIN set yet — the signup flow
  -- creates it before the user has chosen one.
  is_lock_enabled boolean not null default false,

  -- scrypt(pin, salt). Both hex. NULL until a PIN is set.
  mpin_hash      text,
  mpin_salt      text,
  mpin_set_at    timestamptz,

  -- Failed unlock attempts, and when a lockout expires. Reset to zero on any
  -- successful unlock, so a user who fat-fingers the PIN twice is not one slip
  -- away from a lockout a week later.
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz,
  last_unlocked_at timestamptz,

  -- Convenience mirror of "has at least one enrolled credential". Kept because
  -- the lock screen asks this on every unlock and a count(*) per attempt would
  -- be silly.
  biometric_enabled boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A lock can be on only if there is a PIN to satisfy it; otherwise the user
  -- would be locked out of their own app with no way in.
  constraint user_security_pin_required
    check (is_lock_enabled = false or mpin_hash is not null)
);

comment on column public.user_security.mpin_hash is
  'scrypt digest, hex. There is deliberately no column holding the PIN itself.';
comment on column public.user_security.locked_until is
  'Set after too many failed attempts; cleared by a password-reset email, not by a guess.';

alter table public.user_security enable row level security;
drop policy if exists "user_security_owner_all" on public.user_security;
create policy "user_security_owner_all" on public.user_security
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.user_security;
create trigger set_updated_at before update on public.user_security
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. WebAuthn credentials
-- ---------------------------------------------------------------------------

create table if not exists public.webauthn_credentials (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,

  -- Base64url, exactly as the authenticator returned it. Unique across the whole
  -- table, not per user: it is the lookup key, and authenticators are supposed
  -- to be globally unique, so scoping it per user would let two accounts' keys
  -- collide and silently overwrite each other.
  credential_id  text not null unique,

  -- Base64url COSE public key. The private key never leaves the device.
  public_key     text not null,
  -- Signature counter for clone detection. Optional: some authenticators omit it.
  counter        bigint not null default 0,
  transports     text[] not null default '{}',

  device_label   text,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,

  constraint webauthn_credentials_label_length
    check (device_label is null or char_length(device_label) <= 80)
);

create index if not exists webauthn_credentials_user_idx
  on public.webauthn_credentials (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2b. Pending WebAuthn challenges
-- ---------------------------------------------------------------------------

-- A WebAuthn response is only meaningful against the challenge it was issued
-- for. Verifying statelessly -- comparing the challenge inside the response
-- against itself -- accepts a replayed response forever, which removes the one
-- property the entire flow exists to provide.
--
-- So the challenge is held here and deleted the moment it is answered, making it
-- single-use. A row that survives an abandoned enrolment expires on its own
-- after `expires_at`, so it cannot be consumed days later.
--
-- Keyed by (user_id, purpose) rather than user_id alone: enrolment and unlock
-- generate different challenges, and consuming one with the other's response
-- must fail.
create table if not exists public.webauthn_challenges (
  user_id    uuid not null references auth.users (id) on delete cascade,
  purpose    text not null check (purpose in ('register', 'authenticate')),
  challenge  text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, purpose)
);

create index if not exists webauthn_challenges_expiry_idx
  on public.webauthn_challenges (expires_at);

alter table public.webauthn_challenges enable row level security;
drop policy if exists "webauthn_challenges_owner_all" on public.webauthn_challenges;
create policy "webauthn_challenges_owner_all" on public.webauthn_challenges
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Opportunities to guess or replay a challenge die with the row either way.
drop trigger if exists set_updated_at on public.webauthn_challenges;
delete from public.webauthn_challenges where expires_at < now();

alter table public.webauthn_credentials enable row level security;
-- Read-only from the client: enrolling and verifying both happen through server
-- actions, so a browser that can write this table directly could enrol its own
-- key and unlock the account.
drop policy if exists "webauthn_credentials_owner_all" on public.webauthn_credentials;
drop policy if exists "webauthn_credentials_owner_read" on public.webauthn_credentials;
create policy "webauthn_credentials_owner_read" on public.webauthn_credentials
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Backfill a row for every existing user
-- ---------------------------------------------------------------------------

-- So an existing account has a lock setting to read on its very next page load
-- instead of the code having to treat "no row" and "lock off" as different
-- things everywhere.
insert into public.user_security (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. How long an unlock lasts
-- ---------------------------------------------------------------------------

-- On user_preferences rather than user_security, because it is a preference and
-- the table already has one row per user with a primary key to upsert against.
-- Adding a nullable column with a default would have written the same value to
-- every existing row for no reason.
alter table public.user_preferences
  add column if not exists lock_duration text not null default 'five'
    check (lock_duration in ('immediately', 'minute', 'five', 'fifteen', 'hour', 'session'));

comment on column public.user_preferences.lock_duration is
  'How long an unlocked app stays unlocked before the lock screen returns.';

comment on table public.user_security is
  'App-lock settings per user: MPIN (scrypt-hashed), lockout state, biometric flag.';
comment on table public.webauthn_credentials is
  'Enrolled WebAuthn public keys. Private keys stay in the device; only public keys and a clone-detection counter are stored.';

commit;
