import type { Metadata } from "next";
import { requireUser, getProfile } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileSettings } from "@/components/settings/profile-settings";

export const metadata: Metadata = {
  title: "Profile",
};

export const dynamic = "force-dynamic";

function initials(displayName: string | null | undefined, email: string): string {
  const name = displayName?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }
  return (email[0] ?? "U").toUpperCase();
}

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  let avatarUrl: string | null = null;
  if (profile?.avatar_url) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.storage.from("ownspece-files").createSignedUrl(profile.avatar_url, 3600);
      avatarUrl = data?.signedUrl ?? null;
    } catch {
      avatarUrl = null;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile" description="Your account details and preferences." />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Card className="lg:w-80">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <Avatar size="lg" className="size-24">
              <AvatarImage src={avatarUrl ?? undefined} alt="Your avatar" />
              <AvatarFallback className="text-2xl">{initials(profile?.display_name, user.email ?? "")}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{profile?.display_name ?? "No display name"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {profile?.username ? (
                <p className="text-xs text-muted-foreground">@{profile.username}</p>
              ) : null}
            </div>
            {profile?.created_at ? (
              <p className="text-xs text-muted-foreground">
                Member since {formatDate(profile.created_at)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Edit profile</CardTitle>
            <CardDescription>Update your display name, username and avatar.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileSettings
              displayName={profile?.display_name ?? null}
              username={profile?.username ?? null}
              email={user.email ?? ""}
              avatarUrl={avatarUrl}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}