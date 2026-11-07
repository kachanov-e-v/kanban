"use server";

import { revalidatePath } from "next/cache";
import { requireSession, findUserById } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

export type ProfileDTO = {
  id: number;
  name: string;
  email: string;
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
  aiEnabled: boolean;
};

export async function getProfile(): Promise<ProfileDTO> {
  const session = await requireSession();
  const user = await findUserById(session.userId);
  if (!user) throw new Error("Пользователь не найден");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    aiProvider: user.aiProvider ?? "kilo",
    aiBaseUrl: user.aiBaseUrl ?? "",
    aiModel: user.aiModel ?? "",
    aiApiKey: user.aiApiKey ?? "",
    aiEnabled: user.aiEnabled ?? true,
  };
}

export async function updateProfile(input: {
  name: string;
  email: string;
  password?: string;
}): Promise<void> {
  const session = await requireSession();
  const nameParsed = z.string().trim().min(1).max(80).safeParse(input.name);
  const emailParsed = z.string().trim().email().safeParse(input.email);
  if (!nameParsed.success) throw new Error(nameParsed.error.issues[0]?.message);
  if (!emailParsed.success) throw new Error("Некорректный email");

  const existing = await prisma.user.findFirst({
    where: { email: emailParsed.data.toLowerCase(), NOT: { id: session.userId } },
  });
  if (existing) throw new Error("Email уже используется");

  const data: any = { name: nameParsed.data, email: emailParsed.data.toLowerCase() };
  if (input.password && input.password.trim()) {
    const p = z.string().min(8).max(128).safeParse(input.password);
    if (!p.success) throw new Error("Пароль должен быть не короче 8 символов");
    data.passwordHash = await bcrypt.hash(p.data, 12);
  }

  const updated = await prisma.user.update({ where: { id: session.userId }, data });
  const { createSession } = await import("@/lib/auth");
  await createSession({ userId: updated.id, email: updated.email, name: updated.name });
  revalidatePath("/profile");
}

export async function updateAiSettings(input: {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}): Promise<void> {
  const session = await requireSession();
  const provider = z.enum(["kilo", "openrouter", "custom"]).safeParse(input.provider);
  const baseUrl = z.string().trim().max(500).safeParse(input.baseUrl);
  const model = z.string().trim().max(100).safeParse(input.model);
  const apiKey = z.string().trim().max(500).safeParse(input.apiKey);
  if (!provider.success || !baseUrl.success || !model.success || !apiKey.success) throw new Error("Некорректные настройки ИИ");
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      aiProvider: provider.data,
      aiBaseUrl: baseUrl.data || null,
      aiModel: model.data || null,
      aiApiKey: apiKey.data || null,
      aiEnabled: input.enabled,
    },
  });
  revalidatePath("/profile");
}

export async function getAiConfig(userId: number): Promise<{
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const provider = user?.aiProvider || "kilo";
  let baseUrl = user?.aiBaseUrl?.trim() || "";
  let model = user?.aiModel?.trim() || "";
  const apiKey = user?.aiApiKey?.trim() || process.env.AI_API_KEY || "";
  if (!baseUrl) {
    if (provider === "kilo") baseUrl = "https://api.kilo.ai/api/gateway/v1/chat/completions";
    else if (provider === "openrouter") baseUrl = "https://openrouter.ai/api/v1/chat/completions";
    else baseUrl = process.env.AI_BASE_URL || "https://text.pollinations.ai/openai";
  }
  if (!model) {
    if (provider === "kilo") model = "reflection/beam-free";
    else if (provider === "openrouter") model = "openai/gpt-4o-mini";
    else model = process.env.AI_MODEL || "openai";
  }
  const enabled = user?.aiEnabled !== false;
  return { baseUrl, model, apiKey, enabled };
}

export async function getProviderModels(provider: string): Promise<string[]> {
  const url =
    provider === "kilo"
      ? "https://api.kilo.ai/api/gateway/v1/models"
      : provider === "openrouter"
      ? "https://openrouter.ai/api/v1/models"
      : null;
  if (!url) return [];
  try {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const json = await res.json();
    const items: any[] = Array.isArray(json) ? json : (json.data ?? []);
    const free = items.filter((m) => {
      if (m.isFree === true) return true;
      const id = String(m.id ?? "");
      if (id.endsWith(":free")) return true;
      if (id === "openrouter/free" || id === "kilo-auto/free") return true;
      const p = m.pricing?.prompt;
      const c = m.pricing?.completion;
      return (p === "0" || p === 0) && (c === "0" || c === 0);
    });
    return free.map((m) => String(m.id)).sort();
  } catch {
    return [];
  }
}