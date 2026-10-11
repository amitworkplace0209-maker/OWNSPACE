import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/dal";
import { getGDriveAccessToken } from "@/lib/gdrive";

const GOOGLE_DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";

/**
 * Proxies a Google Drive download through the server so the access token is
 * never exposed to the browser.
 *
 * `connectionId` selects which linked account to read from — file ids are only
 * meaningful inside the Drive they came from, so the account has to travel
 * with the request.
 */
export async function GET(request: NextRequest) {
  await requireUser();

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  const connectionId = request.nextUrl.searchParams.get("connectionId") ?? undefined;

  const tokenRes = await getGDriveAccessToken(connectionId);
  if (tokenRes.token === null) {
    // A withdrawn grant is a 403 here, not a 401: the session is fine, the
    // Drive connection is not.
    return NextResponse.json(
      { error: tokenRes.error },
      { status: tokenRes.revoked ? 403 : 401 }
    );
  }

  try {
    const metaRes = await fetch(
      `${GOOGLE_DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=name,mimeType,size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${tokenRes.token}` } }
    );
    if (!metaRes.ok) {
      return NextResponse.json(
        { error: "Could not load the Drive file." },
        { status: metaRes.status }
      );
    }
    const meta = (await metaRes.json()) as { name?: string; mimeType?: string; size?: string };

    const fileRes = await fetch(
      `${GOOGLE_DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${tokenRes.token}` } }
    );

    if (!fileRes.ok || !fileRes.body) {
      return NextResponse.json(
        { error: "Could not download the Drive file." },
        { status: fileRes.status }
      );
    }

    const rawName = meta.name ?? "download";
    // The ASCII fallback is sanitised because it is interpolated into a quoted
    // header; the UTF-8 form carries the real name.
    const asciiName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_") || "download";
    const headers = new Headers(fileRes.headers);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
    );
    if (meta.mimeType && !headers.has("Content-Type")) {
      headers.set("Content-Type", meta.mimeType);
    }
    if (meta.size && !headers.has("Content-Length")) {
      headers.set("Content-Length", meta.size);
    }

    return new Response(fileRes.body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Google Drive download failed." }, { status: 502 });
  }
}