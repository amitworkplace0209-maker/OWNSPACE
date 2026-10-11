import { requireUser } from "@/lib/dal";
import { getActiveProjects } from "@/lib/dal/projects";
import { getStorageStats } from "@/lib/dal/storage";
import { getGDriveFileRefs, getGDriveStatus, summarizeLinks } from "@/lib/dal/gdrive";
import { PageHeader } from "@/components/shared/page-header";
import { GDriveWorkspace } from "@/components/gdrive/gdrive-workspace";

export const metadata = {
  title: "G Drive",
};

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google Drive is not configured on this server.",
  denied: "Google Drive access was cancelled.",
  state_mismatch: "That sign-in attempt expired. Start again from this page.",
  no_code: "Google did not return an authorisation code.",
  no_email: "Google did not report which account was authorised.",
  no_refresh: "Google did not issue a refresh token, so this account cannot stay connected.",
  store_failed: "Could not save the connection. Check the database and try again.",
  exchange_failed: "Could not complete the Google sign-in.",
  email_mismatch: "That is not the account Google authorised.",
};

export default async function GDrivePage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    account?: string;
    error?: string;
    expected?: string;
    actual?: string;
  }>;
}) {
  await requireUser();
  const params = await searchParams;

  const [{ configured, accounts, error }, projects, fileRefs, storage] = await Promise.all([
    getGDriveStatus(),
    getActiveProjects(),
    getGDriveFileRefs(),
    getStorageStats(),
  ]);

  let notice: { kind: "success" | "error"; message: string } | null = null;
  if (params.connected === "1") {
    notice = {
      kind: "success",
      message: params.account
        ? `${params.account} is connected.`
        : "Google Drive account connected.",
    };
  } else if (params.error) {
    // The mismatch case carries both addresses so the user can see exactly
    // which account they ended up on versus the one they typed.
    if (params.error === "email_mismatch" && params.expected && params.actual) {
      notice = {
        kind: "error",
        message: `You asked for ${params.expected}, but Google authorised ${params.actual}. Sign in to the right account and try again.`,
      };
    } else {
      notice = {
        kind: "error",
        message: ERROR_MESSAGES[params.error] ?? "Google Drive sign-in failed.",
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Google Drive"
        description="Link any number of Google accounts, browse every folder, and pull files into your projects."
      />
      <GDriveWorkspace
        configured={configured}
        accounts={accounts}
        error={error}
        fileRefs={fileRefs}
        linkSummary={summarizeLinks(fileRefs)}
        projects={projects}
        supabaseStorage={
          storage ? { usedBytes: storage.usedBytes, fileCount: storage.fileCount } : null
        }
        notice={notice}
      />
    </div>
  );
}