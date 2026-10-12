import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/signup-form";

export default async function SignUpPage() {
  const user = await getUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <AuthShell
      title="Create your workspace"
      description="One account for projects, tasks, notes and money."
    >
      <SignUpForm />
    </AuthShell>
  );
}