import { redirect } from "next/navigation";

/**
 * `/files` became `/resources`.
 *
 * The page is no longer just files: it now lists Google Drive references and
 * links too, and the whole thing reads as "everything attached to my work".
 * Redirecting rather than deleting the route keeps bookmarks, the manifest
 * shortcuts and any shared link working.
 */
export default function FilesRedirect() {
  redirect("/resources");
}