"use client";

import { useActionState } from "react";

import { ESTADO_INICIAL } from "@/lib/action-state";
import { FieldError } from "@/components/field-error";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/features/auth/actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signIn, ESTADO_INICIAL);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@duliconsulting.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <FieldError mensagem={state.error} />

      <SubmitButton pendente="Entrando..." className="w-full">Entrar</SubmitButton>
    </form>
  );
}
