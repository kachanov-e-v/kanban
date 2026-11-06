"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    registerAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Input
        name="name"
        type="text"
        label="Имя"
        placeholder="Ваше имя"
        autoComplete="name"
        required
      />
      <Input
        name="email"
        type="email"
        label="Email"
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <Input
        name="password"
        type="password"
        label="Пароль"
        placeholder="Минимум 8 символов"
        autoComplete="new-password"
        required
      />
      {state?.error && (
        <p
          role="alert"
          className="type-body-medium text-error bg-error-container/40 rounded-radius-sm px-3 py-2"
        >
          {state.error}
        </p>
      )}
      <Button type="submit" loading={pending} className="w-full">
        Зарегистрироваться
      </Button>
    </form>
  );
}
