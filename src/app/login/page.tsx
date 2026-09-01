import Image from "next/image";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Duli Hub" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Já autenticado não tem o que fazer aqui.
  if (user) redirect("/");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center space-y-3 text-center">
          <Image
            src="/duli-logo.png"
            alt="Duli Consulting"
            width={64}
            height={64}
            className="mx-auto h-16 w-16 object-contain"
            priority
          />
          <div>
            <h1 className="text-xl font-semibold text-primary">Duli Hub</h1>
            <p className="text-sm text-muted-foreground">
              Sistema de gestão — Duli Consulting
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
