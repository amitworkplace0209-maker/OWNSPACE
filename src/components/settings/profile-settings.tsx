"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FormField } from "@/components/shared/form-field";
import { updateProfileAction, updateAvatarAction } from "@/lib/actions/profile";
import { initials } from "@/lib/utils";

type FormState = { error?: string; data?: { id: string } };

export function ProfileSettings({
  displayName,
  username,
  email,
  avatarUrl,
}: {
  displayName: string | null;
  username: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateProfileAction, {});
  const [avatarState, avatarAction, avatarPending] = useActionState<FormState, FormData>(updateAvatarAction, {});
  const [dirty, setDirty] = useState(false);
  const avatarStateRef = useRef(avatarState);

  useEffect(() => {
    if (avatarStateRef.current !== avatarState) {
      avatarStateRef.current = avatarState;
      if (!avatarState.error && avatarState.data) {
        toast.success("Avatar updated.");
        router.refresh();
      }
    }
  }, [avatarState, router]);

  useEffect(() => {
    if (state.data) {
      toast.success("Profile saved.");
    }
  }, [state.data]);

  return (
    <div className="flex flex-col gap-4">
      <form action={avatarAction} className="flex items-center gap-4">
        <div className="relative">
          <Avatar size="lg">
            <AvatarImage src={avatarUrl ?? undefined} alt="Your avatar" />
            <AvatarFallback>{initials(displayName, email)}</AvatarFallback>
          </Avatar>
          {avatarPending ? (
            <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-muted">
              <Loader2 className="size-3 animate-spin" />
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
            <Camera className="size-4" />
            Change avatar
            <input
              type="file"
              name="avatar"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) {
                  const fd = new FormData();
                  fd.append("avatar", e.target.files[0]);
                  avatarAction(fd);
                }
              }}
            />
          </label>
          <span className="text-xs text-muted-foreground">Up to 2 MB</span>
        </div>
      </form>
      {avatarState.error ? <p className="text-sm text-destructive">{avatarState.error}</p> : null}

      <form action={formAction} className="flex flex-col gap-4" noValidate onSubmit={() => setDirty(false)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Display name" hint="Shown in the app header and greetings.">
            <Input
              name="display_name"
              defaultValue={displayName ?? ""}
              placeholder="Your name"
              onChange={() => setDirty(true)}
            />
          </FormField>
          <FormField label="Username" hint="3–30 characters, used for your profile URL.">
            <Input
              name="username"
              defaultValue={username ?? ""}
              placeholder="username"
              onChange={() => setDirty(true)}
            />
          </FormField>
        </div>
        <FormField label="Email" hint="Managed by your Supabase account.">
          <Input readOnly value={email} className="text-muted-foreground" />
        </FormField>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
