import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { friendlyError } from "@/lib/actions/helpers";
import type { GDriveConnection } from "@/types";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_ABOUT_ENDPOINT = "https://www.googleapis.com/drive/v3/about";

/**
 * Full Drive access — browse, search, download, create, rename, move and trash
 * files/folders across your entire Google Drive.
 */
export const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export const GDRIVE_WRITE_SCOPE = "https://www.googleapis.com/auth/drive";

export const GDRIVE_SCOPES = GDRIVE_SCOPE;

export function isGDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function googleEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google Drive integration is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

/**
 * The redirect URI, derived from the request rather than from a value the
 * caller supplies.
 *
 * `redirect_uri` has to match Google's console entry exactly, and deriving it
 * server-side is what stops a caller from pointing Google's consent screen at
 * a host they control. A client-supplied origin was previously interpolated
 * straight into the auth URL.
 */
export function gdriveCallbackUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/auth/gdrive/callback`;
}

export function buildGDriveAuthUrl(requestUrl: string, state: string): string {
  const { clientId } = googleEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: gdriveCallbackUrl(requestUrl),
    response_type: "code",
    scope: GDRIVE_SCOPES,
    access_type: "offline",
    // Without `prompt=consent` Google only issues a refresh token the first
    // time, so re-adding an account would store a null refresh token.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export type GDriveTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string;
};

async function postToken(params: URLSearchParams): Promise<GDriveTokens> {
  const { clientId, clientSecret } = googleEnv();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof body.access_token !== "string") {
    throw new GoogleApiError(getGoogleError(body, "Google could not complete the OAuth exchange."), googleErrorCode(body));
  }

  return {
    accessToken: body.access_token as string,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 3600,
    scope: typeof body.scope === "string" ? body.scope : GDRIVE_SCOPES,
  };
}

export class GoogleApiError extends Error {
  code: string;
  constructor(message: string, code = "unknown") {
    super(message);
    this.name = "GoogleApiError";
    this.code = code;
  }
}

/** Google's machine-readable error code, used to detect a revoked grant. */
function googleErrorCode(body: Record<string, unknown>): string {
  const error = body.error as Record<string, unknown> | undefined;
  const code = typeof error?.status === "string" ? error.status : body.error;
  return typeof code === "string" ? code : "unknown";
}

/**
 * `invalid_grant` means the user withdrew consent. It is permanent and no
 * amount of retrying will fix it, so it has to be distinguishable from a
 * transient network failure.
 */
export function isRevokedGrant(error: unknown): boolean {
  return (
    error instanceof GoogleApiError &&
    (error.code === "invalid_grant" ||
      error.code === "unauthorized_client" ||
      /invalid_grant|revoked|has been revoked/i.test(error.message))
  );
}

export async function exchangeGDriveCode(code: string, requestUrl: string): Promise<GDriveTokens> {
  return postToken(
    new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: gdriveCallbackUrl(requestUrl),
    })
  );
}

async function refreshGDriveToken(refreshToken: string): Promise<GDriveTokens> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })
  );
}

export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  modifiedTime: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  isFolder: boolean;
  /** Google-native docs (Docs/Sheets/Slides) have no byte size. */
  isGoogleDoc: boolean;
  owners: Array<{ emailAddress: string; displayName: string }>;
  shared: boolean;
  driveId: string | null;
};

function mapDriveItem(f: {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  ownedByMe?: boolean;
  shared?: boolean;
  driveId?: string;
  owners?: Array<{ emailAddress?: string; displayName?: string }>;
}): DriveItem {
  const mimeType = f.mimeType ?? "unknown";
  return {
    id: f.id,
    name: f.name ?? "Untitled",
    mimeType,
    size: f.size ?? null,
    modifiedTime: f.modifiedTime ?? null,
    webViewLink: f.webViewLink ?? null,
    webContentLink: f.webContentLink ?? null,
    isFolder: mimeType === FOLDER_MIME,
    isGoogleDoc: mimeType.startsWith("application/vnd.google-apps."),
    owners: (f.owners ?? [])
      .filter((owner): owner is { emailAddress: string; displayName: string } => Boolean(owner?.emailAddress))
      .map((owner) => ({ emailAddress: owner.emailAddress, displayName: owner.displayName })),
    shared: Boolean(f.shared),
    driveId: f.driveId ?? null,
  };
}

const FILE_FIELDS =
  "nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,webContentLink,ownedByMe,shared,driveId,owners(emailAddress,displayName))";

export type DriveListOptions = {
  accessToken: string;
  parentId?: string;
  query?: string;
  pageSize?: number;
  pageToken?: string;
  /** Restrict to files owned by one Google account (shared-with-me browsing). */
  ownerEmail?: string;
  /** Hide Google Docs, whose "size" is meaningless. */
  filesOnly?: boolean;
  orderBy?: "folder,name" | "name" | "modifiedTime desc";
};

export type DriveListResult = {
  items: DriveItem[];
  nextPageToken: string | null;
  error: string | null;
};

/**
 * Escapes a value for Drive's `q` grammar.
 *
 * Drive queries are a string language, so an unescaped apostrophe in a search
 * box would change the query's meaning (or 400 the whole request). Backslash
 * and the two quote characters are the characters the grammar treats specially.
 */
export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Trims to something Google's 1000-char query budget will accept. */
function clampQuery(value: string, max = 120): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function driveListFiles(options: DriveListOptions): Promise<DriveListResult> {
  const params = new URLSearchParams({
    fields: FILE_FIELDS,
    pageSize: String(Math.min(Math.max(options.pageSize ?? 100, 1), 1000)),
    orderBy: options.orderBy === "name" ? "name" : options.orderBy === "modifiedTime desc" ? "modifiedTime desc" : "folder,name",
    // Without these, files living in a Shared Drive are invisible.
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
  });

  const clauses = ["trashed = false"];

  if (options.parentId) {
    clauses.push(`'${escapeDriveQuery(options.parentId)}' in parents`);
  }
  if (options.query?.trim()) {
    clauses.push(`name contains '${escapeDriveQuery(clampQuery(options.query))}'`);
  }
  if (options.ownerEmail) {
    clauses.push(`'${escapeDriveQuery(clampQuery(options.ownerEmail, 200))}' in owners`);
    // Someone else's files only appear here if they were shared with you.
    clauses.push("sharedWithMe = true");
  }
  if (options.filesOnly) {
    clauses.push(`mimeType != '${FOLDER_MIME}'`);
  }

  params.set("q", clauses.join(" and "));
  if (options.pageToken) params.set("pageToken", options.pageToken);

  try {
    const res = await fetch(`${GOOGLE_DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${options.accessToken}` },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        items: [],
        nextPageToken: null,
        error: getGoogleError(body, "Drive API request failed."),
      };
    }
    const body = (await res.json()) as { files?: unknown[]; nextPageToken?: string };
    return {
      items: ((body.files ?? []) as Parameters<typeof mapDriveItem>[0][]).map(mapDriveItem),
      nextPageToken: body.nextPageToken ?? null,
      error: null,
    };
  } catch {
    return { items: [], nextPageToken: null, error: "Could not reach the Google Drive API." };
  }
}

/** One folder's metadata, used to build a breadcrumb path. */
export async function driveGetFolder(
  accessToken: string,
  folderId: string
): Promise<{ name: string; error: string | null }> {
  try {
    const params = new URLSearchParams({
      fields: "id,name",
      supportsAllDrives: "true",
    });
    const res = await fetch(`${GOOGLE_DRIVE_FILES_ENDPOINT}/${encodeURIComponent(folderId)}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return { name: "Folder", error: getGoogleError(await res.json().catch(() => ({})), "Could not read that folder.") };
    }
    const body = (await res.json()) as { name?: string };
    return { name: body.name ?? "Folder", error: null };
  } catch {
    return { name: "Folder", error: "Could not reach the Google Drive API." };
  }
}

export type DriveQuota = {
  /** Total bytes the account may use, from Drive itself. */
  limit: number;
  used: number;
  /** Shared-drive bytes do not count against the personal quota. */
  sharedLimit: number | null;
  sharedUsed: number | null;
  userEmail: string | null;
  displayName: string | null;
};

/**
 * Real quota from Drive's `about.get` — the only source of these numbers.
 *
 * Never synthesise a limit: showing an invented figure is worse than showing
 * none, so a missing value is reported as null and rendered as such.
 */
export async function driveGetQuota(accessToken: string): Promise<{
  quota: DriveQuota | null;
  error: string | null;
}> {
  try {
    const params = new URLSearchParams({ fields: "storageQuota,user" });
    const res = await fetch(`${GOOGLE_DRIVE_ABOUT_ENDPOINT}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return { quota: null, error: getGoogleError(await res.json().catch(() => ({})), "Could not read Drive storage.") };
    }
    const body = (await res.json()) as {
      storageQuota?: {
        limit?: string;
        usage?: string;
        sharedDriveLimit?: string;
        sharedDriveUsage?: string;
      };
      user?: { emailAddress?: string; displayName?: string };
    };

    const quota = body.storageQuota;
    if (!quota) return { quota: null, error: "Drive did not report a storage quota." };

    const toNumber = (value: string | undefined): number | null => {
      if (value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return {
      quota: {
        limit: toNumber(quota.limit) ?? 0,
        used: toNumber(quota.usage) ?? 0,
        sharedLimit: toNumber(quota.sharedDriveLimit),
        sharedUsed: toNumber(quota.sharedDriveUsage),
        userEmail: body.user?.emailAddress ?? null,
        displayName: body.user?.displayName ?? null,
      },
      error: null,
    };
  } catch {
    return { quota: null, error: "Could not reach the Google Drive API." };
  }
}

/** Shared drives this account can see, so they are browsable too. */
export async function driveListSharedDrives(accessToken: string): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    const params = new URLSearchParams({ pageSize: "50" });
    const res = await fetch(`${GOOGLE_DRIVE_FILES_ENDPOINT}/drives?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { drives?: Array<{ id: string; name: string }> };
    return body.drives ?? [];
  } catch {
    return [];
  }
}

/**
 * Deletes (trashes) a file or folder. Requires the write scope; a read-only
 * connection gets a clear message rather than a raw 403.
 */
export async function driveTrash(accessToken: string, fileId: string): Promise<{ error: string | null }> {
  try {
    const params = new URLSearchParams({ supportsAllDrives: "true" });
    const res = await fetch(`${GOOGLE_DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?${params}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return {
        error: getGoogleError(await res.json().catch(() => ({})), "Could not remove that file."),
      };
    }
    return { error: null };
  } catch {
    return { error: "Could not reach the Google Drive API." };
  }
}

/** Creates a folder. Needs the write scope. */
export async function driveCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<{ item: DriveItem | null; error: string | null }> {
  try {
    const res = await fetch(GOOGLE_DRIVE_FILES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim() || "Untitled folder",
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    if (!res.ok) {
      return { item: null, error: getGoogleError(await res.json().catch(() => ({})), "Could not create the folder.") };
    }
    return { item: mapDriveItem((await res.json()) as Parameters<typeof mapDriveItem>[0]), error: null };
  } catch {
    return { item: null, error: "Could not reach the Google Drive API." };
  }
}

/** Direct download URL (works with the access token via cookie-less query). */
export function driveDownloadUrl(item: DriveItem): string | null {
  if (item.isFolder) return null;
  if (item.webContentLink) return item.webContentLink;
  if (item.id) {
    return `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`;
  }
  return null;
}

function getGoogleError(body: Record<string, unknown>, fallback: string): string {
  const error = (body.error as Record<string, unknown> | undefined)?.message ?? body.error_description;
  return typeof error === "string" && error ? error : fallback;
}

/** Fetch the account email for a freshly-exchanged access token. */
export async function fetchGDriveEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GOOGLE_USERINFO_ENDPOINT}?alt=json&access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { email?: string };
    return body.email ? body.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export type AccessTokenResult =
  | { token: string; connection: GDriveConnection }
  | { token: null; error: string; revoked?: boolean; connection?: GDriveConnection };

/**
 * Mints an access token for one connected account.
 *
 * `connectionId` selects the account; omitting it uses the most recently
 * connected one, which is what the dashboard's single-line Drive status needs.
 *
 * When Google reports a withdrawn grant the row is marked `revoked` instead of
 * being left to report "connected" forever — the old code returned an error
 * but kept the row, so the UI showed a connection that could never work.
 */
export async function getGDriveAccessToken(connectionId?: string): Promise<AccessTokenResult> {
  const user = await requireUser();
  if (!isGDriveConfigured()) {
    return { token: null, error: "Google Drive integration is not configured on this server." };
  }

  const supabase = await createClient();
  let query = supabase.from("gdrive_connections").select("*").eq("user_id", user.id);

  if (connectionId) {
    query = query.eq("id", connectionId);
  } else {
    query = query.order("last_connected_at", { ascending: false, nullsFirst: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return {
      token: null,
      error: connectionId
        ? "That Drive account is no longer connected."
        : "No Google Drive account is connected yet.",
    };
  }

  const connection = data as GDriveConnection;
  if (connection.status === "revoked") {
    return {
      token: null,
      connection,
      error: `Access to ${connection.account_email} was withdrawn. Reconnect it to browse again.`,
      revoked: true,
    };
  }

  const now = Date.now();
  // Reuse the stored token only while it is comfortably valid; the 60s skew
  // covers a token that expires while a Drive call is in flight.
  if (
    connection.access_token &&
    connection.expires_at &&
    new Date(connection.expires_at).getTime() > now + 60_000
  ) {
    return { token: connection.access_token, connection };
  }

  try {
    const tokens = await refreshGDriveToken(connection.refresh_token);
    await supabase
      .from("gdrive_connections")
      .update({
        access_token: tokens.accessToken,
        expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
        status: "active",
        last_error: null,
      })
      .eq("id", connection.id);

    return { token: tokens.accessToken, connection };
  } catch (err) {
    const revoked = isRevokedGrant(err);
    await supabase
      .from("gdrive_connections")
      .update({
        status: revoked ? "revoked" : "error",
        last_error: friendlyError(err, "Could not refresh the Google Drive connection."),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return {
      token: null,
      connection,
      revoked,
      error: revoked
        ? `Access to ${connection.account_email} was withdrawn. Reconnect it to browse again.`
        : friendlyError(err, "Could not refresh the Google Drive connection."),
    };
  }
}