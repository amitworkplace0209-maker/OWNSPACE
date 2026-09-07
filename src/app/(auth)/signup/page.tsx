import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/signup-form";

export default async function SignUpPage() {
  const user = await getUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <AuthCard description="Create your account to get started.">
      <SignUpForm />
    </AuthCard>
  );
}