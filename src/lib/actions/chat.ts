"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBoard } from "@/lib/actions/board";
import { getAiConfig } from "@/lib/actions/profile";
import { z } from "zod";

export type ChatMessageDTO = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const AI_BASE_URL =
  process.env.AI_BASE_URL || "https://text.pollinations.ai/openai";
const AI_MODEL = process.env.AI_MODEL || "openai";
const AI_API_KEY = process.env.AI_API_KEY;

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

const tools = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Получить текущую погоду в указанном городе.",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "Название города" } },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_list",
      description: "Создать новый список (колонку) на текущей доске.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_card",
      description: "Создать карточку в указанном списке текущей доски.",
      parameters: {
        type: "object",
        properties: {
          listId: { type: "number", description: "ID списка" },
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["listId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_cards",
      description: "Создать несколько карточек в указанном списке текущей доски.",
      parameters: {
        type: "object",
        properties: {
          listId: { type: "number" },
          titles: { type: "array", items: { type: "string" } },
        },
        required: ["listId", "titles"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_card",
      description: "Переместить карточку в другой список/позицию.",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "number" },
          toListId: { type: "number" },
          toIndex: { type: "number" },
        },
        required: ["cardId", "toListId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_card",
      description: "Архивировать или восстановить карточку.",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "number" },
          archived: { type: "boolean" },
        },
        required: ["cardId", "archived"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_card",
      description: "Удалить карточку.",
      parameters: {
        type: "object",
        properties: { cardId: { type: "number" } },
        required: ["cardId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_label",
      description: "Создать метку на доске.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          color: { type: "string", description: "HEX цвет, например #eb5a46" },
        },
        required: ["name", "color"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_card",
      description: "Обновить карточку: название, описание, срок, цвет обложки.",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          dueDate: { type: "string", description: "ISO дата или null" },
          coverColor: { type: "string" },
        },
        required: ["cardId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_label_to_card",
      description: "Привязать метку к карточке.",
      parameters: {
        type: "object",
        properties: { cardId: { type: "number" }, labelId: { type: "number" } },
        required: ["cardId", "labelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_label_from_card",
      description: "Снять метку с карточки.",
      parameters: {
        type: "object",
        properties: { cardId: { type: "number" }, labelId: { type: "number" } },
        required: ["cardId", "labelId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checklist",
      description: "Создать чек-лист в карточке.",
      parameters: {
        type: "object",
        properties: { cardId: { type: "number" }, title: { type: "string" } },
        required: ["cardId", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checklist_item",
      description: "Добавить пункт в чек-лист.",
      parameters: {
        type: "object",
        properties: { checklistId: { type: "number" }, text: { type: "string" } },
        required: ["checklistId", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_attachment",
      description: "Добавить вложение (URL) к карточке.",
      parameters: {
        type: "object",
        properties: {
          cardId: { type: "number" },
          name: { type: "string" },
          url: { type: "string" },
        },
        required: ["cardId", "name", "url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fill_cards",
      description: "Массово заполнить поля у нескольких карточек за один вызов (описание, срок, цвет, метки, чек-лист, комментарий, вложение, участник).",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                cardId: { type: "number" },
                title: { type: "string" },
                description: { type: "string" },
                dueDate: { type: "string" },
                coverColor: { type: "string" },
                labelIds: { type: "array", items: { type: "number" } },
                checklistTitle: { type: "string" },
                checklistItems: { type: "array", items: { type: "string" } },
                comment: { type: "string" },
                attachmentName: { type: "string" },
                attachmentUrl: { type: "string" },
                memberId: { type: "number" },
              },
              required: ["cardId"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Поиск информации в интернете по запросу.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
];
async function ownedBoard(boardId: number, userId: number): Promise<boolean> {
  const row = await prisma.board.findFirst({ where: { id: boardId, ownerId: userId }, select: { id: true } });
  return !!row;
}

async function insertMessage(
  boardId: number,
  userId: number,
  role: string,
  content: string | null,
  toolCalls?: ToolCall[] | null,
  toolCallId?: string | null,
  name?: string | null,
) {
  await prisma.chatMessage.create({
    data: {
      boardId,
      userId,
      role,
      content: content ?? undefined,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : null,
      toolCallId: toolCallId ?? null,
      name: name ?? null,
    },
  });
}

async function chatCompletion(
  messages: OpenAIMessage[],
  config: { baseUrl: string; model: string; apiKey: string },
): Promise<{
  content: string | null;
  tool_calls?: ToolCall[];
}> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;
  const body = {
    model: config.model,
    messages,
    tools,
    tool_choice: "auto",
    temperature: 0.6,
  };
  const jsonBody = JSON.stringify(body);

  const candidates: string[] = [config.baseUrl];
  if (!/chat\/completions/i.test(config.baseUrl)) {
    const base = config.baseUrl.replace(/\/+$/, "");
    candidates.push(`${base}/v1/chat/completions`);
    candidates.push(`${base}/chat/completions`);
  }

  let lastError = "";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "POST", headers, body: jsonBody });
      if (res.ok) {
        const json = await res.json();
        const msg = json?.choices?.[0]?.message;
        if (!msg) throw new Error("Пустой ответ AI");
        return { content: msg.content ?? null, tool_calls: msg.tool_calls };
      }
      const text = await res.text();
      lastError = `AI HTTP ${res.status}: ${text.slice(0, 200)}`;
      // try next candidate on 404
      if (res.status !== 404) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastError || "Ошибка AI");
}

async function getWeather(city: string): Promise<string> {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`,
  );
  if (!geoRes.ok) throw new Error("Геокодинг недоступен");
  const geo = await geoRes.json();
  const place = geo?.results?.[0];
  if (!place) return `Город "${city}" не найден.`;
  const fcRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`,
  );
  if (!fcRes.ok) throw new Error("Прогноз недоступен");
  const fc = await fcRes.json();
  const c = fc?.current;
  const codeMap: Record<number, string> = {
    0: "ясно", 1: "преимущественно ясно", 2: "переменная облачность", 3: "пасмурно",
    45: "туман", 48: "изморозь", 51: "морось", 53: "умеренная морось", 55: "сильная морось",
    61: "небольшой дождь", 63: "дождь", 65: "сильный дождь", 71: "небольшой снег",
    73: "снег", 75: "сильный снег", 80: "ливни", 95: "гроза",
  };
  const desc = codeMap[c?.weather_code] ?? `код ${c?.weather_code}`;
  return `Погода в ${place.name} (${place.country}): ${desc}, температура ${c?.temperature_2m}°C, влажность ${c?.relative_humidity_2m}%, ветер ${c?.wind_speed_10m} м/с.`;
}

async function boardStateText(boardId: number): Promise<string> {
  const board = await getBoard(boardId);
  if (!board) return "Доска не найдена.";
  const lines: string[] = [];
  lines.push(`Доска: ${board.board.title} (id=${board.board.id})`);
  if (board.members.length) {
    lines.push(`Участники: ${board.members.map((m) => `${m.name} (id=${m.id})`).join(", ")}`);
  }
  lines.push(`Списки и карточки:`);
  for (const l of board.lists) {
    lines.push(`- Список "${l.title}" (id=${l.id})`);
    for (const c of l.cards) {
      lines.push(`   * Карточка "${c.title}" (id=${c.id})${c.description ? ` — ${c.description}` : ""}`);
    }
  }
  if (board.labels.length) {
    lines.push(`Метки: ${board.labels.map((l) => `${l.name || "•"} (id=${l.id}, ${l.color})`).join(", ")}`);
  }
  return lines.join("\n");
}

﻿async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { boardId: number; userId: number },
): Promise<string> {
  const { boardId, userId } = ctx;

  switch (name) {
    case "get_weather": {
      const city = z.string().min(1).parse(args.city);
      return await getWeather(city);
    }
    case "create_list": {
      const title = z.string().trim().min(1).max(80).parse(args.title);
      const max = await prisma.list.aggregate({ where: { boardId }, _max: { position: true } });
      await prisma.list.create({ data: { boardId, title, position: (max._max.position ?? -1) + 1 } });
      return `Список "${title}" создан.`;
    }
    case "create_card": {
      const listId = z.number().int().parse(args.listId);
      const title = z.string().trim().min(1).max(120).parse(args.title);
      const description = z.string().max(5000).optional().parse(args.description ?? "");
      const list = await prisma.list.findFirst({ where: { id: listId, boardId } });
      if (!list) return "Список не найден на этой доске.";
      const max = await prisma.card.aggregate({ where: { listId }, _max: { position: true } });
      const card = await prisma.card.create({ data: { listId, title, description: description ?? "", position: (max._max.position ?? -1) + 1, createdById: userId } });
      return `Карточка "${title}" создана (id=${card.id}).`;
    }
    case "create_cards": {
      const listId = z.number().int().parse(args.listId);
      const titles = z.array(z.string().trim().min(1).max(120)).parse(args.titles);
      const list = await prisma.list.findFirst({ where: { id: listId, boardId } });
      if (!list) return "Список не найден на этой доске.";
      const maxAgg = await prisma.card.aggregate({ where: { listId }, _max: { position: true } });
      let max = maxAgg._max.position ?? -1;
      const ids: number[] = [];
      for (const t of titles) {
        max += 1;
        const card = await prisma.card.create({ data: { listId, title: t, description: "", position: max, createdById: userId } });
        ids.push(card.id);
      }
      return `Создано ${titles.length} карточек. Идентификаторы: ${ids.map((id, i) => `${id} (${titles[i]})`).join(", ")}.`;
    }
    case "move_card": {
      const cardId = z.number().int().parse(args.cardId);
      const toListId = z.number().int().parse(args.toListId);
      const toIndex = z.number().int().optional().parse(args.toIndex ?? 0);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена на этой доске.";
      const toList = await prisma.list.findFirst({ where: { id: toListId, boardId } });
      if (!toList) return "Список назначения не найден.";
      const fromListId = card.listId;
      await prisma.$transaction(async (tx) => {
        if (fromListId !== toListId) {
          const srcCards = await tx.card.findMany({ where: { listId: fromListId, id: { not: cardId }, isArchived: false }, orderBy: [{ position: "asc" }, { id: "asc" }] });
          for (let i = 0; i < srcCards.length; i++) await tx.card.update({ where: { id: srcCards[i].id }, data: { position: i } });
        }
        const destCards = await tx.card.findMany({ where: { listId: toListId, id: { not: cardId }, isArchived: false }, orderBy: [{ position: "asc" }, { id: "asc" }] });
        const clamped = Math.max(0, Math.min(toIndex ?? 0, destCards.length));
        destCards.splice(clamped, 0, card as any);
        await tx.card.update({ where: { id: cardId }, data: { listId: toListId } });
        for (let i = 0; i < destCards.length; i++) await tx.card.update({ where: { id: destCards[i].id }, data: { position: i, listId: toListId } });
      });
      return `Карточка ${cardId} перемещена.`;
    }
    case "archive_card": {
      const cardId = z.number().int().parse(args.cardId);
      const archived = z.boolean().parse(args.archived);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      await prisma.card.update({ where: { id: cardId }, data: { isArchived: archived, updatedAt: new Date() } });
      return archived ? `Карточка ${cardId} архивирована.` : `Карточка ${cardId} восстановлена.`;
    }
    case "delete_card": {
      const cardId = z.number().int().parse(args.cardId);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      await prisma.card.delete({ where: { id: cardId } });
      return `Карточка ${cardId} удалена.`;
    }
    case "create_label": {
      const name = z.string().trim().max(40).parse(args.name ?? "");
      const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(args.color);
      const r = await prisma.label.create({ data: { boardId, name, color } });
      return `Метка создана (id=${r.id}).`;
    }
    case "add_comment": {
      const cardId = z.number().int().parse(args.cardId);
      const text = z.string().trim().min(1).max(2000).parse(args.text);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      await prisma.comment.create({ data: { cardId, userId, text } });
      return `Комментарий добавлен к карточке ${cardId}.`;
    }
    case "update_card": {
      const cardId = z.number().int().parse(args.cardId);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      const data: any = {};
      if (args.title !== undefined) data.title = z.string().trim().min(1).max(120).parse(args.title);
      if (args.description !== undefined) data.description = z.string().max(5000).parse(args.description);
      if (args.dueDate !== undefined) data.dueDate = args.dueDate === null ? null : new Date(z.string().parse(args.dueDate));
      if (args.coverColor !== undefined) data.coverColor = args.coverColor === null ? null : z.string().parse(args.coverColor);
      if (Object.keys(data).length === 0) return "Нет изменений.";
      data.updatedAt = new Date();
      await prisma.card.update({ where: { id: cardId }, data });
      return `Карточка ${cardId} обновлена.`;
    }
    case "add_label_to_card": {
      const cardId = z.number().int().parse(args.cardId);
      const labelId = z.number().int().parse(args.labelId);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      const label = await prisma.label.findFirst({ where: { id: labelId, boardId } });
      if (!label) return "Метка не найдена.";
      await prisma.cardLabel.upsert({ where: { cardId_labelId: { cardId, labelId } }, create: { cardId, labelId }, update: {} });
      return `Метка ${labelId} привязана к карточке ${cardId}.`;
    }
    case "remove_label_from_card": {
      const cardId = z.number().int().parse(args.cardId);
      const labelId = z.number().int().parse(args.labelId);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      await prisma.cardLabel.deleteMany({ where: { cardId, labelId } });
      return `Метка ${labelId} снята с карточки ${cardId}.`;
    }
    case "create_checklist": {
      const cardId = z.number().int().parse(args.cardId);
      const title = z.string().trim().min(1).max(80).parse(args.title);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      const max = await prisma.checklist.aggregate({ where: { cardId }, _max: { position: true } });
      const r = await prisma.checklist.create({ data: { cardId, title, position: (max._max.position ?? -1) + 1 } });
      return `Чек-лист "${title}" создан (id=${r.id}).`;
    }
    case "create_checklist_item": {
      const checklistId = z.number().int().parse(args.checklistId);
      const text = z.string().trim().min(1).max(200).parse(args.text);
      const row = await prisma.checklist.findFirst({ where: { id: checklistId, card: { list: { boardId } } } });
      if (!row) return "Чек-лист не найден.";
      const max = await prisma.checklistItem.aggregate({ where: { checklistId }, _max: { position: true } });
      await prisma.checklistItem.create({ data: { checklistId, text, position: (max._max.position ?? -1) + 1 } });
      return `Пункт добавлен в чек-лист ${checklistId}.`;
    }
    case "add_attachment": {
      const cardId = z.number().int().parse(args.cardId);
      const name = z.string().trim().min(1).max(120).parse(args.name);
      const url = z.string().trim().url().parse(args.url);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      await prisma.attachment.create({ data: { cardId, name, url } });
      return `Вложение "${name}" добавлено к карточке ${cardId}.`;
    }
    case "add_member_to_card": {
      const cardId = z.number().int().parse(args.cardId);
      const userIdArg = z.number().int().parse(args.userId);
      const card = await prisma.card.findFirst({ where: { id: cardId, list: { boardId } } });
      if (!card) return "Карточка не найдена.";
      await prisma.cardMember.upsert({ where: { cardId_userId: { cardId, userId: userIdArg } }, create: { cardId, userId: userIdArg }, update: {} });
      return `Участник ${userIdArg} назначен на карточку ${cardId}.`;
    }
    case "fill_cards": {
      const items = z.array(z.object({
        cardId: z.number().int(),
        title: z.string().optional(),
        description: z.string().optional(),
        dueDate: z.string().optional(),
        coverColor: z.string().optional(),
        labelIds: z.array(z.number().int()).optional(),
        checklistTitle: z.string().optional(),
        checklistItems: z.array(z.string()).optional(),
        comment: z.string().optional(),
        attachmentName: z.string().optional(),
        attachmentUrl: z.string().optional(),
        memberId: z.number().int().optional(),
      })).parse(args.items);
      let count = 0;
      for (const it of items) {
        const card = await prisma.card.findFirst({ where: { id: it.cardId, list: { boardId } } });
        if (!card) continue;
        const data: any = {};
        if (it.title !== undefined) data.title = it.title;
        if (it.description !== undefined) data.description = it.description;
        if (it.dueDate !== undefined) data.dueDate = new Date(it.dueDate);
        if (it.coverColor !== undefined) data.coverColor = it.coverColor;
        if (Object.keys(data).length) {
          data.updatedAt = new Date();
          await prisma.card.update({ where: { id: it.cardId }, data });
        }
        if (it.labelIds) {
          for (const lid of it.labelIds) {
            await prisma.cardLabel.upsert({ where: { cardId_labelId: { cardId: it.cardId, labelId: lid } }, create: { cardId: it.cardId, labelId: lid }, update: {} });
          }
        }
        if (it.checklistTitle) {
          const max = await prisma.checklist.aggregate({ where: { cardId: it.cardId }, _max: { position: true } });
          const cl = await prisma.checklist.create({ data: { cardId: it.cardId, title: it.checklistTitle, position: (max._max.position ?? -1) + 1 } });
          if (it.checklistItems) {
            let pos = 0;
            for (const t of it.checklistItems) {
              await prisma.checklistItem.create({ data: { checklistId: cl.id, text: t, position: pos++ } });
            }
          }
        }
        if (it.comment) await prisma.comment.create({ data: { cardId: it.cardId, userId, text: it.comment } });
        if (it.attachmentName && it.attachmentUrl) await prisma.attachment.create({ data: { cardId: it.cardId, name: it.attachmentName, url: it.attachmentUrl } });
        if (it.memberId !== undefined) await prisma.cardMember.upsert({ where: { cardId_userId: { cardId: it.cardId, userId: it.memberId } }, create: { cardId: it.cardId, userId: it.memberId }, update: {} });
        count++;
      }
      return `Заполнено полей у ${count} карточек.`;
    }
    case "web_search": {
      const query = z.string().trim().min(1).max(200).parse(args.query);
      try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) return `Поиск недоступен (HTTP ${res.status}).`;
        const html = await res.text();
        const results: { title: string; url: string; snippet: string }[] = [];
        const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = re.exec(html)) !== null && results.length < 5) {
          const url = m[1];
          const title = m[2].replace(/<[^>]+>/g, "").trim();
          const snippet = m[3].replace(/<[^>]+>/g, "").trim();
          results.push({ title, url, snippet });
        }
        if (!results.length) return `По запросу "${query}" ничего не найдено.`;
        return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
      } catch (e) {
        return `Ошибка поиска: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    default:
      return `Неизвестный инструмент: ${name}`;
  }
}


export async function getChatHistory(boardId: number): Promise<ChatMessageDTO[]> {
  const session = await requireSession();
  if (!(await ownedBoard(boardId, session.userId))) throw new Error("Доска не найдена");
  const rows = await prisma.chatMessage.findMany({
    where: { boardId, userId: session.userId, role: { in: ["user", "assistant"] }, content: { not: null } },
    orderBy: { id: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content as string,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function clearChatHistory(boardId: number): Promise<void> {
  const session = await requireSession();
  if (!(await ownedBoard(boardId, session.userId))) throw new Error("Доска не найдена");
  await prisma.chatMessage.deleteMany({ where: { boardId, userId: session.userId } });
  revalidatePath(`/board/${boardId}`);
}

export async function sendChatMessage(
  boardId: number,
  userText: string,
): Promise<{ reply: string }> {
  const session = await requireSession();
  if (!(await ownedBoard(boardId, session.userId))) throw new Error("Доска не найдена");
  return runChat(boardId, session.userId, userText);
}

async function runChat(
  boardId: number,
  userId: number,
  userText: string,
): Promise<{ reply: string }> {
  const parsed = z.string().trim().min(1).max(4000).safeParse(userText);
  if (!parsed.success) throw new Error("Сообщение не может быть пустым");
  const text = parsed.data;

  if (!(await ownedBoard(boardId, userId))) throw new Error("Доска не найдена");

  const aiConfig = await getAiConfig(userId);
  if (!aiConfig.enabled) throw new Error("ИИ отключён в настройках профиля");

  await insertMessage(boardId, userId, "user", text);

  const system = `Ты — AI-ассистент внутри канбан-доски. Отвечай на русском языке.
У тебя есть доступ ТОЛЬКО к текущей доске (id=${boardId}). Никогда не упоминай и не используй другие доски — их не существует для тебя.
Ты можешь отвечать на общие вопросы (в том числе про погоду через get_weather и искать информацию в интернете через web_search) и управлять текущей доской: создавать/обновлять списки и карточки (название, описание, срок, цвет), перемещать/архивировать/удалять карточки, создавать и привязывать метки, добавлять комментарии, чек-листы и пункты, вложения, назначать участников.
Когда пользователь просит создать "список карточек" — создай список (колонку) и/или карточки в подходящем списке. Если списка нет — сначала создай список, затем карточки.
Перед действиями используй актуальное состояние доски ниже. ID списков/карточек бери из него.
Если пользователь просит заполнить все поля карточек — самостоятельно и без уточнений заполни их тестовыми данными: описание, срок, цвет обложки, метки (создай при необходимости), чек-лист с пунктами, комментарий, вложение, участника. Используй ID из состояния доски и результатов инструментов.
Старайся выполнять задачи за минимальное число обращений к модели: объединяй массовые операции в один вызов инструмента (create_cards вместо множества create_card, fill_cards для заполнения полей, несколько tool_calls в одном ответе). Не вызывай инструменты по одному, если можно передать списком.

Текущее состояние доски:
${await boardStateText(boardId)}`;

  // Build history from DB
  const rows = await prisma.chatMessage.findMany({
    where: { boardId, userId },
    orderBy: { id: "asc" },
    select: { role: true, content: true, toolCalls: true, toolCallId: true, name: true },
  });
  const mappedRows = rows.map((r) => ({
    role: r.role,
    content: r.content,
    tool_calls: r.toolCalls,
    tool_call_id: r.toolCallId,
    name: r.name,
  }));

  const history: OpenAIMessage[] = [];
  for (const r of mappedRows) {
    if (r.role === "user") {
      history.push({ role: "user", content: r.content ?? "" });
    } else if (r.role === "assistant") {
      let tc: ToolCall[] | undefined;
      if (r.tool_calls) {
        try {
          tc = JSON.parse(r.tool_calls) as ToolCall[];
        } catch {
          tc = undefined;
        }
      }
      history.push({ role: "assistant", content: r.content, tool_calls: tc });
    } else if (r.role === "tool") {
      history.push({
        role: "tool",
        tool_call_id: r.tool_call_id ?? "",
        name: r.name ?? "",
        content: r.content ?? "",
      });
    }
  }

  const messages: OpenAIMessage[] = [{ role: "system", content: system }, ...history];

  let finalReply = "";
  for (let round = 0; round < 10; round++) {
    const assistant = await chatCompletion(messages, aiConfig);
    if (assistant.tool_calls && assistant.tool_calls.length) {
      await insertMessage(
        boardId,
        userId,
        "assistant",
        assistant.content,
        assistant.tool_calls,
      );
      messages.push({
        role: "assistant",
        content: assistant.content,
        tool_calls: assistant.tool_calls,
      });
      for (const tc of assistant.tool_calls) {
        let result = "";
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          result = await executeTool(tc.function.name, args, {
            boardId,
            userId: userId,
          });
        } catch (e) {
          result = `Ошибка: ${e instanceof Error ? e.message : String(e)}`;
        }
        await insertMessage(boardId, userId, "tool", result, null, tc.id, tc.function.name);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: result,
        });
      }
    } else {
      finalReply = assistant.content ?? "Готово.";
      await insertMessage(boardId, userId, "assistant", finalReply);
      messages.push({ role: "assistant", content: finalReply });
      break;
    }
  }
  if (!finalReply) finalReply = "Готово.";

  revalidatePath(`/board/${boardId}`);
  return { reply: finalReply };
}