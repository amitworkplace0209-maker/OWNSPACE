import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { safeNextPath } from "@/lib/auth/utils";
import { AuthCard } from "@/components/auth/auth-card";
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
    <AuthCard description="Sign in to access your workspace.">
      <LoginForm next={next} />
    </AuthCard>
  );
}