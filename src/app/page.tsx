import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Layers, CheckSquare, NotebookPen } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Layers className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Ownspece</h1>
          <p className="mx-auto max-w-md text-muted-foreground">
            Your personal project operating system. Plan, build, and ship your
            software, technical, and personal projects from a single workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button render={<Link href="/signup" />} size="lg">
            Create free account
          </Button>
          <Button render={<Link href="/login" />} variant="outline" size="lg">
            Sign in
          </Button>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckSquare className="h-4 w-4" /> Tasks
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> Projects
          </span>
          <span className="flex items-center gap-1.5">
            <NotebookPen className="h-4 w-4" /> Notes
          </span>
        </div>
      </div>
    </main>
  );
}
