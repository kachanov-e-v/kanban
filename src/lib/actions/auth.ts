"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
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

    const existing = findUserByEmail(email);
    if (existing) {
      return { error: "Пользователь с таким email уже существует" };
    }

    const passwordHash = await hashPassword(password);
    const db = getDb();
    const result = db
      .prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)")
      .run(email, name, passwordHash);
    const userId = Number(result.lastInsertRowid);

    // Seed a welcome board with default lists (Trello-like).
    const boardResult = db
      .prepare("INSERT INTO boards (owner_id, title, description, background) VALUES (?, ?, ?, ?)")
      .run(userId, "Добро пожаловать", "Ваша первая доска", "default");
    const boardId = Number(boardResult.lastInsertRowid);

    const defaultLabels = [
      { name: "", color: "#61bd4f" },
      { name: "", color: "#f2d600" },
      { name: "", color: "#ff9f1a" },
      { name: "", color: "#eb5a46" },
      { name: "", color: "#c377e0" },
      { name: "", color: "#0079bf" },
    ];
    const insLabel = db.prepare("INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)");
    const txLabels = db.transaction(() => defaultLabels.forEach((l) => insLabel.run(boardId, l.name, l.color)));
    txLabels();

    const defaultLists = ["К выполнению", "В работе", "Готово"];
    const insList = db.prepare("INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)");
    const txLists = db.transaction(() => defaultLists.forEach((t, idx) => insList.run(boardId, t, idx)));
    txLists();

    await createSession({ userId, email, name });
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

    const user = findUserByEmail(email);
    if (!user) {
      return { error: "Неверный email или пароль" };
    }
    const ok = await verifyPassword(password, user.password_hash);
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
