"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getDb, type ChatMessageRow } from "@/lib/db";
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
];

function ownedBoard(boardId: number, userId: number): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM boards WHERE id = ? AND owner_id = ?")
    .get(boardId, userId);
  return !!row;
}

function insertMessage(
  boardId: number,
  userId: number,
  role: string,
  content: string | null,
  toolCalls?: ToolCall[] | null,
  toolCallId?: string | null,
  name?: string | null,
) {
  const db = getDb();
  db.prepare(
    "INSERT INTO chat_messages (board_id, user_id, role, content, tool_calls, tool_call_id, name) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    boardId,
    userId,
    role,
    content,
    toolCalls ? JSON.stringify(toolCalls) : null,
    toolCallId ?? null,
    name ?? null,
  );
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

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { boardId: number; userId: number },
): Promise<string> {
  const db = getDb();
  const { boardId, userId } = ctx;

  switch (name) {
    case "get_weather": {
      const city = z.string().min(1).parse(args.city);
      return await getWeather(city);
    }
    case "create_list": {
      const title = z.string().trim().min(1).max(80).parse(args.title);
      const max = db
        .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM lists WHERE board_id = ?")
        .get(boardId) as { m: number };
      db.prepare("INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)").run(
        boardId,
        title,
        max.m + 1,
      );
      return `Список "${title}" создан.`;
    }
    case "create_card": {
      const listId = z.number().int().parse(args.listId);
      const title = z.string().trim().min(1).max(120).parse(args.title);
      const description = z.string().max(5000).optional().parse(args.description ?? "");
      // verify list belongs to board
      const list = db
        .prepare("SELECT id FROM lists WHERE id = ? AND board_id = ?")
        .get(listId, boardId);
      if (!list) return "Список не найден на этой доске.";
      const max = db
        .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM cards WHERE list_id = ?")
        .get(listId) as { m: number };
      const r = db
        .prepare("INSERT INTO cards (list_id, title, description, position, created_by) VALUES (?, ?, ?, ?, ?)")
        .run(listId, title, description ?? "", max.m + 1, userId);
      return `Карточка "${title}" создана (id=${r.lastInsertRowid}).`;
    }
    case "create_cards": {
      const listId = z.number().int().parse(args.listId);
      const titles = z.array(z.string().trim().min(1).max(120)).parse(args.titles);
      const list = db
        .prepare("SELECT id FROM lists WHERE id = ? AND board_id = ?")
        .get(listId, boardId);
      if (!list) return "Список не найден на этой доске.";
      let max = (db
        .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM cards WHERE list_id = ?")
        .get(listId) as { m: number }).m;
      const ids: number[] = [];
      const tx = db.transaction(() => {
        for (const t of titles) {
          max += 1;
          const r = db
            .prepare("INSERT INTO cards (list_id, title, description, position, created_by) VALUES (?, ?, ?, ?, ?)")
            .run(listId, t, "", max, userId);
          ids.push(Number(r.lastInsertRowid));
        }
      });
      tx();
      return `Создано ${titles.length} карточек. Идентификаторы: ${ids.map((id, i) => `${id} (${titles[i]})`).join(", ")}.`;
    }
    case "move_card": {
      const cardId = z.number().int().parse(args.cardId);
      const toListId = z.number().int().parse(args.toListId);
      const toIndex = z.number().int().optional().parse(args.toIndex ?? 0);
      // verify card and lists belong to board
      const card = db
        .prepare(
          `SELECT c.id, c.list_id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`,
        )
        .get(cardId, boardId) as { id: number; list_id: number } | undefined;
      if (!card) return "Карточка не найдена на этой доске.";
      const toList = db
        .prepare("SELECT id FROM lists WHERE id = ? AND board_id = ?")
        .get(toListId, boardId);
      if (!toList) return "Список назначения не найден.";
      const fromListId = card.list_id;
      const tx = db.transaction(() => {
        if (fromListId !== toListId) {
          const srcCards = db
            .prepare("SELECT id FROM cards WHERE list_id = ? AND id != ? AND is_archived = 0 ORDER BY position ASC, id ASC")
            .all(fromListId, cardId) as { id: number }[];
          srcCards.forEach((c, idx) => db.prepare("UPDATE cards SET position = ? WHERE id = ?").run(idx, c.id));
        }
        const destCards = db
          .prepare("SELECT id FROM cards WHERE list_id = ? AND id != ? AND is_archived = 0 ORDER BY position ASC, id ASC")
          .all(toListId, cardId) as { id: number }[];
        const clamped = Math.max(0, Math.min(toIndex ?? 0, destCards.length));
        destCards.splice(clamped, 0, { id: cardId });
        db.prepare("UPDATE cards SET list_id = ? WHERE id = ?").run(toListId, cardId);
        destCards.forEach((c, idx) =>
          db.prepare("UPDATE cards SET position = ?, list_id = ? WHERE id = ?").run(idx, toListId, c.id),
        );
      });
      tx();
      return `Карточка ${cardId} перемещена.`;
    }
    case "archive_card": {
      const cardId = z.number().int().parse(args.cardId);
      const archived = z.boolean().parse(args.archived);
      const card = db
        .prepare(
          `SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`,
        )
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      db.prepare("UPDATE cards SET is_archived = ?, updated_at = datetime('now') WHERE id = ?").run(
        archived ? 1 : 0,
        cardId,
      );
      return archived ? `Карточка ${cardId} архивирована.` : `Карточка ${cardId} восстановлена.`;
    }
    case "delete_card": {
      const cardId = z.number().int().parse(args.cardId);
      const card = db
        .prepare(
          `SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`,
        )
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      db.prepare("DELETE FROM cards WHERE id = ?").run(cardId);
      return `Карточка ${cardId} удалена.`;
    }
    case "create_label": {
      const name = z.string().trim().max(40).parse(args.name ?? "");
      const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).parse(args.color);
      const r = db
        .prepare("INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)")
        .run(boardId, name, color);
      return `Метка создана (id=${r.lastInsertRowid}).`;
    }
    case "add_comment": {
      const cardId = z.number().int().parse(args.cardId);
      const text = z.string().trim().min(1).max(2000).parse(args.text);
      const card = db
        .prepare(
          `SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`,
        )
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      db.prepare("INSERT INTO comments (card_id, user_id, text) VALUES (?, ?, ?)").run(
        cardId,
        userId,
        text,
      );
      return `Комментарий добавлен к карточке ${cardId}.`;
    }
    case "update_card": {
      const cardId = z.number().int().parse(args.cardId);
      const card = db
        .prepare(
          `SELECT c.id, c.list_id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`,
        )
        .get(cardId, boardId) as { id: number; list_id: number } | undefined;
      if (!card) return "Карточка не найдена.";
      const fields: string[] = [];
      const values: unknown[] = [];
      if (args.title !== undefined) {
        const t = z.string().trim().min(1).max(120).parse(args.title);
        fields.push("title = ?");
        values.push(t);
      }
      if (args.description !== undefined) {
        const d = z.string().max(5000).parse(args.description);
        fields.push("description = ?");
        values.push(d);
      }
      if (args.dueDate !== undefined) {
        const due = args.dueDate === null ? null : z.string().parse(args.dueDate);
        fields.push("due_date = ?");
        values.push(due);
      }
      if (args.coverColor !== undefined) {
        const cc = args.coverColor === null ? null : z.string().parse(args.coverColor);
        fields.push("cover_color = ?");
        values.push(cc);
      }
      if (!fields.length) return "Нет изменений.";
      fields.push("updated_at = datetime('now')");
      values.push(cardId);
      db.prepare(`UPDATE cards SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      return `Карточка ${cardId} обновлена.`;
    }
    case "add_label_to_card": {
      const cardId = z.number().int().parse(args.cardId);
      const labelId = z.number().int().parse(args.labelId);
      const card = db
        .prepare(`SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`)
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      const label = db.prepare("SELECT board_id FROM labels WHERE id = ?").get(labelId) as { board_id: number } | undefined;
      if (!label || label.board_id !== boardId) return "Метка не найдена.";
      db.prepare("INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)").run(cardId, labelId);
      return `Метка ${labelId} привязана к карточке ${cardId}.`;
    }
    case "remove_label_from_card": {
      const cardId = z.number().int().parse(args.cardId);
      const labelId = z.number().int().parse(args.labelId);
      const card = db
        .prepare(`SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`)
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      db.prepare("DELETE FROM card_labels WHERE card_id = ? AND label_id = ?").run(cardId, labelId);
      return `Метка ${labelId} снята с карточки ${cardId}.`;
    }
    case "create_checklist": {
      const cardId = z.number().int().parse(args.cardId);
      const title = z.string().trim().min(1).max(80).parse(args.title);
      const card = db
        .prepare(`SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`)
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      const max = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM checklists WHERE card_id = ?").get(cardId) as { m: number };
      const r = db.prepare("INSERT INTO checklists (card_id, title, position) VALUES (?, ?, ?)").run(cardId, title, max.m + 1);
      return `Чек-лист "${title}" создан (id=${r.lastInsertRowid}).`;
    }
    case "create_checklist_item": {
      const checklistId = z.number().int().parse(args.checklistId);
      const text = z.string().trim().min(1).max(200).parse(args.text);
      const row = db
        .prepare(
          `SELECT cl.id, cl.card_id, c.list_id, l.board_id FROM checklists cl JOIN cards c ON c.id = cl.card_id JOIN lists l ON l.id = c.list_id WHERE cl.id = ? AND l.board_id = ?`,
        )
        .get(checklistId, boardId) as { id: number } | undefined;
      if (!row) return "Чек-лист не найден.";
      const max = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM checklist_items WHERE checklist_id = ?").get(checklistId) as { m: number };
      db.prepare("INSERT INTO checklist_items (checklist_id, text, position) VALUES (?, ?, ?)").run(checklistId, text, max.m + 1);
      return `Пункт добавлен в чек-лист ${checklistId}.`;
    }
    case "add_attachment": {
      const cardId = z.number().int().parse(args.cardId);
      const name = z.string().trim().min(1).max(120).parse(args.name);
      const url = z.string().trim().url().parse(args.url);
      const card = db
        .prepare(`SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`)
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      db.prepare("INSERT INTO attachments (card_id, name, url) VALUES (?, ?, ?)").run(cardId, name, url);
      return `Вложение "${name}" добавлено к карточке ${cardId}.`;
    }
    case "add_member_to_card": {
      const cardId = z.number().int().parse(args.cardId);
      const userIdArg = z.number().int().parse(args.userId);
      const card = db
        .prepare(`SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`)
        .get(cardId, boardId);
      if (!card) return "Карточка не найдена.";
      db.prepare("INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)").run(cardId, userIdArg);
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
        const card = db
          .prepare(`SELECT c.id FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = ? AND l.board_id = ?`)
          .get(it.cardId, boardId);
        if (!card) continue;
        // update card fields
        const fields: string[] = [];
        const values: unknown[] = [];
        if (it.title !== undefined) { fields.push("title = ?"); values.push(it.title); }
        if (it.description !== undefined) { fields.push("description = ?"); values.push(it.description); }
        if (it.dueDate !== undefined) { fields.push("due_date = ?"); values.push(it.dueDate); }
        if (it.coverColor !== undefined) { fields.push("cover_color = ?"); values.push(it.coverColor); }
        if (fields.length) {
          fields.push("updated_at = datetime('now')");
          values.push(it.cardId);
          db.prepare(`UPDATE cards SET ${fields.join(", ")} WHERE id = ?`).run(...values);
        }
        if (it.labelIds) {
          for (const lid of it.labelIds) {
            db.prepare("INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)").run(it.cardId, lid);
          }
        }
        if (it.checklistTitle) {
          const max = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM checklists WHERE card_id = ?").get(it.cardId) as { m: number };
          const r = db.prepare("INSERT INTO checklists (card_id, title, position) VALUES (?, ?, ?)").run(it.cardId, it.checklistTitle, max.m + 1);
          const clId = Number(r.lastInsertRowid);
          if (it.checklistItems) {
            let pos = 0;
            for (const t of it.checklistItems) {
              db.prepare("INSERT INTO checklist_items (checklist_id, text, position) VALUES (?, ?, ?)").run(clId, t, pos++);
            }
          }
        }
        if (it.comment) {
          db.prepare("INSERT INTO comments (card_id, user_id, text) VALUES (?, ?, ?)").run(it.cardId, userId, it.comment);
        }
        if (it.attachmentName && it.attachmentUrl) {
          db.prepare("INSERT INTO attachments (card_id, name, url) VALUES (?, ?, ?)").run(it.cardId, it.attachmentName, it.attachmentUrl);
        }
        if (it.memberId !== undefined) {
          db.prepare("INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)").run(it.cardId, it.memberId);
        }
        count++;
      }
      return `Заполнено полей у ${count} карточек.`;
    }
    default:
      return `Неизвестный инструмент: ${name}`;
  }
}

export async function getChatHistory(boardId: number): Promise<ChatMessageDTO[]> {
  const session = await requireSession();
  if (!ownedBoard(boardId, session.userId)) throw new Error("Доска не найдена");
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, role, content, created_at FROM chat_messages WHERE board_id = ? AND user_id = ? AND role IN ('user','assistant') AND content IS NOT NULL ORDER BY id ASC",
    )
    .all(boardId, session.userId) as { id: number; role: string; content: string; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.created_at,
  }));
}

export async function clearChatHistory(boardId: number): Promise<void> {
  const session = await requireSession();
  if (!ownedBoard(boardId, session.userId)) throw new Error("Доска не найдена");
  getDb()
    .prepare("DELETE FROM chat_messages WHERE board_id = ? AND user_id = ?")
    .run(boardId, session.userId);
  revalidatePath(`/board/${boardId}`);
}

export async function sendChatMessage(
  boardId: number,
  userText: string,
): Promise<{ reply: string }> {
  const session = await requireSession();
  if (!ownedBoard(boardId, session.userId)) throw new Error("Доска не найдена");
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

  if (!ownedBoard(boardId, userId)) throw new Error("Доска не найдена");

  const aiConfig = await getAiConfig(userId);
  if (!aiConfig.enabled) throw new Error("ИИ отключён в настройках профиля");

  insertMessage(boardId, userId, "user", text);

  const system = `Ты — AI-ассистент внутри канбан-доски. Отвечай на русском языке.
У тебя есть доступ ТОЛЬКО к текущей доске (id=${boardId}). Никогда не упоминай и не используй другие доски — их не существует для тебя.
Ты можешь отвечать на общие вопросы (в том числе про погоду через get_weather) и управлять текущей доской: создавать/обновлять списки и карточки (название, описание, срок, цвет), перемещать/архивировать/удалять карточки, создавать и привязывать метки, добавлять комментарии, чек-листы и пункты, вложения, назначать участников.
Когда пользователь просит создать "список карточек" — создай список (колонку) и/или карточки в подходящем списке. Если списка нет — сначала создай список, затем карточки.
Перед действиями используй актуальное состояние доски ниже. ID списков/карточек бери из него.
Если пользователь просит заполнить все поля карточек — самостоятельно и без уточнений заполни их тестовыми данными: описание, срок, цвет обложки, метки (создай при необходимости), чек-лист с пунктами, комментарий, вложение, участника. Используй ID из состояния доски и результатов инструментов.
Старайся выполнять задачи за минимальное число обращений к модели: объединяй массовые операции в один вызов инструмента (create_cards вместо множества create_card, fill_cards для заполнения полей, несколько tool_calls в одном ответе). Не вызывай инструменты по одному, если можно передать списком.

Текущее состояние доски:
${await boardStateText(boardId)}`;

  // Build history from DB
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT role, content, tool_calls, tool_call_id, name FROM chat_messages WHERE board_id = ? AND user_id = ? ORDER BY id ASC",
    )
    .all(boardId, userId) as {
    role: string;
    content: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
    name: string | null;
  }[];

  const history: OpenAIMessage[] = [];
  for (const r of rows) {
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
      insertMessage(
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
        insertMessage(boardId, userId, "tool", result, null, tc.id, tc.function.name);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: result,
        });
      }
    } else {
      finalReply = assistant.content ?? "Готово.";
      insertMessage(boardId, userId, "assistant", finalReply);
      messages.push({ role: "assistant", content: finalReply });
      break;
    }
  }
  if (!finalReply) finalReply = "Готово.";

  revalidatePath(`/board/${boardId}`);
  return { reply: finalReply };
}