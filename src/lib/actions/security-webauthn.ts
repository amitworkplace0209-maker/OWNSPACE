"use server";

import { revalidatePath } from "next/cache";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";

/**
 * WebAuthn enrolment and assertion.
 *
 * Uses SimpleWebAuthn rather than hand-rolled verification, and the reason is
 * worth stating because it is not laziness. Checking a WebAuthn response means
 * parsing CBOR, unpacking a COSE key, re-deriving the client-data hash and
 * verifying a signature — any of which done slightly wrong is not a crash, it is
 * an authentication bypass that looks like it works. That library is the
 * reference implementation and is audited.
 *
 * What is stored is the public key and a signature counter. The private key never
 * leaves the authenticator, which on a phone means the Secure Enclave and on a
 * desktop means the TPM — so a dump of this database contains nothing that can
 * unlock anything.
 */

export type WebauthnResult =
  | { ok: true; credentialId: string }
  | { ok: false; error: string };

export type StoredCredential = {
  id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string[] | null;
  device_label: string | null;
};

/**
 * The origin WebAuthn checks the assertion against.
 *
 * Read from the request rather than configured, because a hard-coded origin is
 * either wrong in every environment or right in exactly one. Falls back to the
 * host of the configured site URL so a server with no incoming host still
 * produces a sane challenge rather than an exception.
 */
async function expectedOrigin(): Promise<string> {
  const headers = await import("next/headers");
  const headerList = await headers.headers();

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";

  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** A stable, non-secret id for this user to scope credentials to. */
function userHandle(userId: string): Uint8Array {
  return new TextEncoder().encode(userId);
}

/**
 * Server-side challenge store.
 *
 * A WebAuthn response is only meaningful against the challenge it was issued
 * for. Verifying statelessly — checking the challenge inside the response
 * against itself — accepts a *replayed* response forever, which removes the one
 * property the whole flow exists to provide. So the challenge lives in a table,
 * keyed by user and purpose, and is deleted the moment it is answered: read
 * once, single-use.
 *
 * A row that survives an abandoned enrolment expires on its own, so it cannot be
 * spent days later.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function saveChallenge(
  userId: string,
  purpose: "register" | "authenticate",
  challenge: string
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("webauthn_challenges").upsert(
    {
      user_id: userId,
      purpose,
      challenge,
      expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    },
    { onConflict: "user_id,purpose" }
  );
}

/**
 * Reads and *removes* the pending challenge in one step.
 *
 * Deleted before it is verified rather than after, so a response that fails
 * verification still burns it. Otherwise an attacker could retry one captured
 * response indefinitely against the same live challenge.
 */
async function consumeChallenge(
  userId: string,
  purpose: "register" | "authenticate"
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("webauthn_challenges")
    .select("challenge, expires_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .maybeSingle();

  if (!data) return null;

  await supabase
    .from("webauthn_challenges")
    .delete()
    .eq("user_id", userId)
    .eq("purpose", purpose);

  const row = data as { challenge: string; expires_at: string };
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.challenge;
}

/**
 * Issues the challenge the browser will answer.
 *
 * Held server-side and single-use, so a captured response cannot be replayed.
 * The browser also refuses a credential it has already enrolled here, which is
 * what stops one device silently replacing another.
 */
export async function beginWebauthnEnrolmentAction(): Promise<{
  options?: string;
  error?: string;
}> {
  const user = await getUserOrRedirect();

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("webauthn_credentials")
    .select("credential_id")
    .eq("user_id", user.id);

  const options = await generateRegistrationOptions({
    rpName: "Ownspece",
    rpID: new URL(await expectedOrigin()).hostname,
    // `TextEncoder#encode` returns a Uint8Array over a possibly-shared buffer,
    // which the library's `Uint8Array<ArrayBuffer>` type will not accept.
    userID: userHandle(user.id) as Uint8Array<ArrayBuffer>,
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? "Ownspece user",
    excludeCredentials: (existing ?? []).map((row) => ({
      id: row.credential_id as string,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await saveChallenge(user.id, "register", options.challenge);

  return { options: JSON.stringify(options) };
}

/** Stores the public key after checking the device really signed it. */
export async function finishWebauthnEnrolmentAction(input: {
  response: string;
  label?: string;
}): Promise<WebauthnResult> {
  const user = await getUserOrRedirect();

  // Burned before it is verified, so a wrong tap cannot be replayed.
  const expected = await consumeChallenge(user.id, "register");
  if (!expected) {
    return { ok: false, error: "That enrolment timed out. Try again." };
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      // Parsed here rather than handed over as a string: the library validates
      // this object's shape, and a cast would move that check past the type
      // system and into a runtime error nobody wrote a test for.
      response: JSON.parse(input.response),
      expectedChallenge: expected,
      expectedOrigin: await expectedOrigin(),
      expectedRPID: new URL(await expectedOrigin()).hostname,
      requireUserVerification: false,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That registration could not be verified.",
    };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: "That registration could not be verified." };
  }

  const { credential } = verification.registrationInfo;
  const supabase = await createClient();

  const { error } = await supabase.from("webauthn_credentials").insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter ?? 0,
    transports: credential.transports ?? [],
    device_label: input.label?.slice(0, 80) ?? null,
  });

  if (error) {
    // 23505 is the unique index on credential_id: this authenticator is already
    // enrolled, which is the `excludeCredentials` list failing rather than a
    // real problem.
    if (error.code === "23505") {
      return { ok: false, error: "This device is already enrolled." };
    }
    return { ok: false, error: friendlyError(error, "Could not save this device.") };
  }

  await supabase
    .from("user_security")
    .update({ biometric_enabled: true })
    .eq("user_id", user.id);

  revalidatePath("/settings");
  return { ok: true, credentialId: credential.id };
}

/** A challenge for the lock screen's fingerprint button. */
export async function beginWebauthnUnlockAction(): Promise<{
  options?: string;
  error?: string;
}> {
  const user = await getUserOrRedirect();

  const supabase = await createClient();
  const { data } = await supabase
    .from("webauthn_credentials")
    .select("credential_id")
    .eq("user_id", user.id);

  if (!data || data.length === 0) {
    return { error: "No biometric device is enrolled." };
  }

  const options = await generateAuthenticationOptions({
    rpID: new URL(await expectedOrigin()).hostname,
    userVerification: "preferred",
    allowCredentials: data.map((row) => ({ id: row.credential_id as string })),
  });

  await saveChallenge(user.id, "authenticate", options.challenge);

  return { options: JSON.stringify(options) };
}

/**
 * Checks a fingerprint assertion and unlocks.
 *
 * The counter is compared as well as the signature. A counter that has gone
 * *backwards* means two authenticators answered with the same credential — the
 * signature is the only thing in a WebAuthn flow that can be replayed otherwise,
 * and this is the check that catches a cloned key.
 */
export async function verifyWebauthnUnlockAction(input: {
  response: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await getUserOrRedirect();

  const supabase = await createClient();
  const { data } = await supabase
    .from("webauthn_credentials")
    .select("*")
    .eq("user_id", user.id);

  const credentials = (data ?? []) as unknown as StoredCredential[];
  if (credentials.length === 0) return { ok: false, error: "No biometric device is enrolled." };

  // Burned before it is verified, so a wrong tap cannot be replayed.
  const expected = await consumeChallenge(user.id, "authenticate");
  if (!expected) {
    return { ok: false, error: "That timed out. Tap again." };
  }

  let parsed: { id?: string };
  try {
    parsed = JSON.parse(input.response) as { id?: string };
  } catch {
    return { ok: false, error: "That response could not be read." };
  }

  const row = credentials.find((entry) => entry.credential_id === parsed.id);
  if (!row) return { ok: false, error: "That device is not enrolled on this account." };

  try {
    const verification = await verifyAuthenticationResponse({
      response: JSON.parse(input.response),
      expectedChallenge: expected,
      expectedOrigin: await expectedOrigin(),
      expectedRPID: new URL(await expectedOrigin()).hostname,
      credential: {
        id: row.credential_id,
        publicKey: Buffer.from(row.public_key, "base64url"),
        counter: row.counter,
        transports: row.transports ?? undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return { ok: false, error: "That did not match. Try your MPIN." };
    }

    await supabase
      .from("webauthn_credentials")
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq("id", row.id);

    await supabase
      .from("user_security")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_unlocked_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That did not match. Try your MPIN.",
    };
  }
}

export async function deleteWebauthnCredentialAction(id: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("webauthn_credentials")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) return { error: friendlyError(error, "Could not remove this device.") };

  // The flag mirrors "has at least one credential", so it has to be recomputed
  // rather than cleared — removing one of two must not switch the whole feature
  // off.
  const { count } = await supabase
    .from("webauthn_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  await supabase
    .from("user_security")
    .update({ biometric_enabled: (count ?? 0) > 0 })
    .eq("user_id", user.id);

  revalidatePath("/settings");
  return {};
}

/** Enrolled devices for the settings list. */
export async function listWebauthnCredentialsAction(): Promise<
  Array<{ id: string; label: string | null; createdAt: string }>
> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data } = await supabase
    .from("webauthn_credentials")
    .select("id, device_label, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    label: (row.device_label as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}
