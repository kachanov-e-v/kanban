"use server";

import { revalidatePath } from "next/cache";
import { requireSession, findUserById, createSession } from "@/lib/auth";
import { getDb, type UserRow } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

export type ProfileDTO = {
  id: number;
  name: string;
  email: string;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  aiEnabled: boolean;
};

export async function getProfile(): Promise<ProfileDTO> {
  const session = await requireSession();
  const user = findUserById(session.userId);
  if (!user) throw new Error("Пользователь не найден");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    aiBaseUrl: user.ai_base_url ?? "",
    aiModel: user.ai_model ?? "",
    aiApiKey: user.ai_api_key ?? "",
    aiEnabled: !!user.ai_enabled,
  };
}

export async function updateProfile(input: {
  name: string;
  email: string;
  password?: string;
}): Promise<void> {
  const session = await requireSession();
  const db = getDb();
  const nameParsed = z.string().trim().min(1).max(80).safeParse(input.name);
  const emailParsed = z.string().trim().email().safeParse(input.email);
  if (!nameParsed.success) throw new Error(nameParsed.error.issues[0]?.message);
  if (!emailParsed.success) throw new Error("Некорректный email");

  // email uniqueness
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
    .get(emailParsed.data.toLowerCase(), session.userId);
  if (existing) throw new Error("Email уже используется");

  const fields: string[] = ["name = ?", "email = ?"];
  const values: unknown[] = [nameParsed.data, emailParsed.data.toLowerCase()];

  if (input.password && input.password.trim()) {
    const p = z.string().min(8).max(128).safeParse(input.password);
    if (!p.success) throw new Error("Пароль должен быть не короче 8 символов");
    values.push(await bcrypt.hash(p.data, 12));
    fields.push("password_hash = ?");
  }

  values.push(session.userId);
  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  // refresh session cookie so header updates
  const updated = findUserById(session.userId);
  if (updated) {
    await createSession({
      userId: updated.id,
      email: updated.email,
      name: updated.name,
    });
  }
  revalidatePath("/profile");
}

export async function updateAiSettings(input: {
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}): Promise<void> {
  const session = await requireSession();
  const db = getDb();
  const baseUrl = z.string().trim().max(500).safeParse(input.baseUrl);
  const model = z.string().trim().max(100).safeParse(input.model);
  const apiKey = z.string().trim().max(500).safeParse(input.apiKey);
  if (!baseUrl.success || !model.success || !apiKey.success) throw new Error("Некорректные настройки ИИ");
  db.prepare(
    "UPDATE users SET ai_base_url = ?, ai_model = ?, ai_api_key = ?, ai_enabled = ? WHERE id = ?",
  ).run(
    baseUrl.data || null,
    model.data || null,
    apiKey.data || null,
    input.enabled ? 1 : 0,
    session.userId,
  );
  revalidatePath("/profile");
}

export async function getAiConfig(userId: number): Promise<{
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}> {
  const db = getDb();
  const user = db
    .prepare("SELECT ai_base_url, ai_model, ai_api_key, ai_enabled FROM users WHERE id = ?")
    .get(userId) as
    | { ai_base_url: string | null; ai_model: string | null; ai_api_key: string | null; ai_enabled: number }
    | undefined;
  const baseUrl = user?.ai_base_url?.trim() || process.env.AI_BASE_URL || "https://text.pollinations.ai/openai";
  const model = user?.ai_model?.trim() || process.env.AI_MODEL || "openai";
  const apiKey = user?.ai_api_key?.trim() || process.env.AI_API_KEY || "";
  const enabled = user?.ai_enabled !== 0;
  return { baseUrl, model, apiKey, enabled };
}