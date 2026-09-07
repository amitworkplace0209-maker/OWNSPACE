import Link from "next/link";
import { Layers } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCard({
  description,
  children,
  footer,
}: {
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Layers className="size-6" />
        </div>
        <CardTitle className="text-xl">Ownspece</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? (
        <CardFooter className="justify-center border-t bg-muted/50 text-sm text-muted-foreground">
          {footer}
        </CardFooter>
      ) : (
        <CardFooter className="justify-center">
          <Link
            href="/"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to homepage
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}