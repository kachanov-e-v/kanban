import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md p-8 rounded-radius-lg">
        <div className="mb-6 text-center">
          <h1 className="type-headline-small text-on-surface">Вход</h1>
          <p className="type-body-medium text-on-surface/70 mt-1">
            Войдите в свой аккаунт
          </p>
        </div>
        <LoginForm />
        <p className="type-body-medium text-on-surface/70 mt-6 text-center">
          Нет аккаунта?{" "}
          <Link
            href="/register"
            className="text-primary font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-radius-xs"
          >
            Зарегистрироваться
          </Link>
        </p>
      </Card>
    </main>
  );
}
