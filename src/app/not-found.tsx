import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <Compass className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          The page you are looking for doesn&apos;t exist or has moved. Check the
          address and try again.
        </p>
      </div>
      <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
    </main>
  );
}