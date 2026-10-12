import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function ForgotPasswordPage() {
  const user = await getUser();
  // Sending a reset link to somebody who is already signed in would email them a
  // link that logs them out of the very session they are using.
  if (user) {
    redirect("/dashboard");
  }

  return (
    <AuthShell title="Reset your password" description="We’ll email you a link.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}