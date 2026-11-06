import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { Card } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md p-8 rounded-radius-lg">
        <div className="mb-6 text-center">
          <h1 className="type-headline-small text-on-surface">Регистрация</h1>
          <p className="type-body-medium text-on-surface/70 mt-1">
            Создайте аккаунт для работы с доской
          </p>
        </div>
        <RegisterForm />
        <p className="type-body-medium text-on-surface/70 mt-6 text-center">
          Уже есть аккаунт?{" "}
          <Link
            href="/login"
            className="text-primary font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-radius-xs"
          >
            Войти
          </Link>
        </p>
      </Card>
    </main>
  );
}
