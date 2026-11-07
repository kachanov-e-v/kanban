"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  findUserByEmail,
} from "@/lib/auth";
import { registerSchema, loginSchema } from "@/lib/validators";

export type AuthState = { error?: string } | null;

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    const parsed = registerSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
    }
    const { name, email, password } = parsed.data;

    const existing = await findUserByEmail(email);
    if (existing) {
      return { error: "Пользователь с таким email уже существует" };
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
        boards: {
          create: {
            title: "Добро пожаловать",
            description: "Ваша первая доска",
            background: "default",
            labels: {
              create: [
                { name: "", color: "#61bd4f" },
                { name: "", color: "#f2d600" },
                { name: "", color: "#ff9f1a" },
                { name: "", color: "#eb5a46" },
                { name: "", color: "#c377e0" },
                { name: "", color: "#0079bf" },
              ],
            },
            lists: {
              create: [
                { title: "К выполнению", position: 0 },
                { title: "В работе", position: 1 },
                { title: "Готово", position: 2 },
              ],
            },
          },
        },
      },
    });

    await createSession({ userId: user.id, email: user.email, name: user.name });
  } catch (e) {
    console.error("registerAction error:", e);
    return { error: e instanceof Error ? e.message : "Неизвестная ошибка" };
  }
  redirect("/board");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  try {
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Некорректные данные" };
    }
    const { email, password } = parsed.data;

    const user = await findUserByEmail(email);
    if (!user) {
      return { error: "Неверный email или пароль" };
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return { error: "Неверный email или пароль" };
    }

    await createSession({ userId: user.id, email: user.email, name: user.name });
  } catch (e) {
    console.error("loginAction error:", e);
    return { error: e instanceof Error ? e.message : "Неизвестная ошибка" };
  }
  redirect("/board");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}