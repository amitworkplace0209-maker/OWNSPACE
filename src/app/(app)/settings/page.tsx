import type { Metadata } from "next";
import { requireUser, getProfile, getPreferences } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileSettings } from "@/components/settings/profile-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { PreferencesSettings } from "@/components/settings/preferences-settings";
import { PomodoroSettings } from "@/components/settings/pomodoro-settings";
import { ExportData } from "@/components/settings/export-data";
import { AccountSettings } from "@/components/settings/account-settings";

export const metadata: Metadata = {
  title: "Settings",
};

export const dynamic = "force-dynamic";

async function getAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("ownspece-files").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [profile, prefs] = await Promise.all([getProfile(user.id), getPreferences(user.id)]);
  const avatarUrl = await getAvatarUrl(profile?.avatar_url ?? null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Manage your profile, appearance and preferences." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How you appear across Ownspece.</CardDescription>
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

        <Card id="appearance" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how Ownspece looks.</CardDescription>
          </CardHeader>
          <CardContent>
            <AppearanceSettings
              defaultView={prefs?.default_view ?? "dashboard"}
              dailyNoteTime={prefs?.daily_note_time ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Productivity and date/time defaults.</CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesSettings
              defaultView={prefs?.default_view ?? "dashboard"}
              dailyNoteTime={prefs?.daily_note_time ?? null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pomodoro</CardTitle>
            <CardDescription>Defaults for new focus sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <PomodoroSettings
              focusMinutes={prefs?.focus_duration_minutes ?? 25}
              breakMinutes={prefs?.break_duration_minutes ?? 5}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>Export everything you&apos;ve created.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportData />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in as {user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountSettings />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}