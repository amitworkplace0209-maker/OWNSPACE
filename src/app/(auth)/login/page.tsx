import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { safeNextPath } from "@/lib/auth/utils";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const user = await getUser();
  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const next = safeNextPath(params.next);

  return (
    <AuthShell title="Welcome back" description="Sign in to open your workspace.">
      <LoginForm next={next} />
    </AuthShell>
  );
}