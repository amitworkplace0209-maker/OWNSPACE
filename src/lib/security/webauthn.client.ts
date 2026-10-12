"use client";

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import {
  beginWebauthnEnrolmentAction,
  finishWebauthnEnrolmentAction,
  beginWebauthnUnlockAction,
  verifyWebauthnUnlockAction,
} from "@/lib/actions/security-webauthn";

/**
 * The browser half of WebAuthn.
 *
 * All of this runs in the browser because the authenticator does; the server's
 * job is to issue the challenge and then check the answer. Split out so the
 * settings panel and the lock screen can call one function each instead of
 * repeating the same four steps.
 */

// The library's JSON option types are not exported at the top level, so they
// come from its types rather than being re-declared here — a local copy would
// drift from the library the first time it changed a field.
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

/** A short name for the device, so the settings list is readable. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const platform = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone"
      : /Mac OS X/i.test(ua)
        ? "Mac"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Device";
  return platform;
}

export function webauthnSupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * Runs the whole enrolment.
 *
 * The `userVerification` hint is "preferred" rather than "required" because a
 * desktop with no fingerprint reader would otherwise be refused outright, and a
 * device PIN or a security key is an acceptable answer to "is this the real
 * person".
 */
export async function beginWebauthnEnrolment(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!webauthnSupported()) {
    return { ok: false, error: "This browser does not support fingerprint unlock." };
  }

  const begin = await beginWebauthnEnrolmentAction();
  if (!begin.options) {
    return { ok: false, error: begin.error ?? "Could not start enrolment." };
  }

  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({
      // The action hands back the challenge as a string because a server action's
      // return value has to survive serialisation; the library wants the object.
      optionsJSON: JSON.parse(begin.options) as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (error) {
    // A user pressing Cancel rejects. That is not an error worth a red toast.
    if (error instanceof Error && /abort|cancel/i.test(error.message)) {
      return { ok: false, error: "cancelled" };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Your device refused to enrol.",
    };
  }

  const result = await finishWebauthnEnrolmentAction({
    response: JSON.stringify(credential),
    label: deviceLabel(),
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * One fingerprint tap.
 *
 * Returns `false` rather than throwing on every failure, because the lock screen
 * always has the MPIN keypad behind this — an error here is "that did not
 * work, type your PIN", not a broken screen.
 */
export async function tryWebauthnUnlock(): Promise<boolean> {
  if (!webauthnSupported()) return false;

  const begin = await beginWebauthnUnlockAction();
  if (!begin.options) return false;

  let assertion: AuthenticationResponseJSON;
  try {
    assertion = await startAuthentication({
      optionsJSON: JSON.parse(begin.options) as PublicKeyCredentialRequestOptionsJSON,
    });
  } catch {
    return false;
  }

  const result = await verifyWebauthnUnlockAction({
    response: JSON.stringify(assertion),
  });

  return result.ok;
}
