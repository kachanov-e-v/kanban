"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import {
  getDb,
  type BoardRow,
  type ListRow,
  type CardRow,
  type LabelRow,
} from "@/lib/db";
import { columnSchema, cardSchema } from "@/lib/validators";
import { z } from "zod";

/* ---------------- DTOs ---------------- */

export type LabelDTO = { id: number; name: string; color: string };

export type CardDTO = {
  id: number;
  listId: number;
  title: string;
  description: string;
  position: number;
  dueDate: string | null;
  isArchived: boolean;
  coverColor: string | null;
  labels: LabelDTO[];
  memberIds: number[];
  commentCount: number;
  attachmentCount: number;
};

export type ListDTO = {
  id: number;
  boardId: number;
  title: string;
  position: number;
  isArchived: boolean;
  cards: CardDTO[];
};

export type BoardDTO = {
  id: number;
  title: string;
  description: string;
  background: string;
  isStarred: boolean;
  isArchived: boolean;
};

export type BoardDetailDTO = {
  board: BoardDTO;
  labels: LabelDTO[];
  lists: ListDTO[];
  members: { id: number; name: string; email: string }[];
};

export type ArchivedCardDTO = {
  card: CardDTO;
  listTitle: string;
};

/* ---------------- helpers ---------------- */

function ownedBoard(boardId: number, userId: number): BoardRow | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM boards WHERE id = ? AND owner_id = ?")
    .get(boardId, userId) as BoardRow | undefined;
}

function boardIdForList(listId: number, userId: number): number | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT l.board_id FROM lists l JOIN boards b ON b.id = l.board_id WHERE l.id = ? AND b.owner_id = ?`,
    )
    .get(listId, userId) as { board_id: number } | undefined;
  return row?.board_id;
}

function listOwned(listId: number, userId: number): ListRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT l.* FROM lists l JOIN boards b ON b.id = l.board_id WHERE l.id = ? AND b.owner_id = ?`,
    )
    .get(listId, userId) as ListRow | undefined;
}

/* ---------------- boards ---------------- */

export async function getBoards(): Promise<BoardDTO[]> {
  const session = await requireSession();
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM boards WHERE owner_id = ? AND is_archived = 0 ORDER BY is_starred DESC, updated_at DESC",
    )
    .all(session.userId) as BoardRow[];
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description ?? "",
    background: b.background,
    isStarred: !!b.is_starred,
    isArchived: !!b.is_archived,
  }));
}

export async function getArchivedBoards(): Promise<BoardDTO[]> {
  const session = await requireSession();
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM boards WHERE owner_id = ? AND is_archived = 1 ORDER BY updated_at DESC",
    )
    .all(session.userId) as BoardRow[];
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description ?? "",
    background: b.background,
    isStarred: !!b.is_starred,
    isArchived: !!b.is_archived,
  }));
}

export async function getBoard(id: number): Promise<BoardDetailDTO | null> {
  const session = await requireSession();
  const db = getDb();
  const board = ownedBoard(id, session.userId);
  if (!board) return null;

  const labels = db
    .prepare("SELECT * FROM labels WHERE board_id = ? ORDER BY id ASC")
    .all(id) as LabelRow[];

  const lists = db
    .prepare(
      "SELECT * FROM lists WHERE board_id = ? AND is_archived = 0 ORDER BY position ASC, id ASC",
    )
    .all(id) as ListRow[];

  const members = db
    .prepare(
      `SELECT u.id, u.name, u.email FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = ?`,
    )
    .all(id) as { id: number; name: string; email: string }[];

  // owner as member
  const owner = db
    .prepare("SELECT id, name, email FROM users WHERE id = ?")
    .get(board.owner_id) as { id: number; name: string; email: string };
  if (!members.some((m) => m.id === owner.id)) members.unshift(owner);

  // cards
  const listIds = lists.map((l) => l.id);
  const cardsByList = new Map<number, CardRow[]>();
  if (listIds.length) {
    const placeholders = listIds.map(() => "?").join(",");
    const cards = db
      .prepare(
        `SELECT * FROM cards WHERE list_id IN (${placeholders}) AND is_archived = 0 ORDER BY position ASC, id ASC`,
      )
      .all(...listIds) as CardRow[];
    for (const c of cards) {
      const arr = cardsByList.get(c.list_id) ?? [];
      arr.push(c);
      cardsByList.set(c.list_id, arr);
    }
  }

  // card labels
  const cardIds = lists.flatMap((l) => (cardsByList.get(l.id) ?? []).map((c) => c.id));
  const labelsByCard = new Map<number, LabelDTO[]>();
  const membersByCard = new Map<number, number[]>();
  const commentCountByCard = new Map<number, number>();
  const attachmentCountByCard = new Map<number, number>();
  if (cardIds.length) {
    const placeholders = cardIds.map(() => "?").join(",");
    const cl = db
      .prepare(
        `SELECT cl.card_id, l.id, l.name, l.color FROM card_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.card_id IN (${placeholders})`,
      )
      .all(...cardIds) as { card_id: number; id: number; name: string; color: string }[];
    for (const r of cl) {
      const arr = labelsByCard.get(r.card_id) ?? [];
      arr.push({ id: r.id, name: r.name, color: r.color });
      labelsByCard.set(r.card_id, arr);
    }
    const cm = db
      .prepare(
        `SELECT card_id, user_id FROM card_members WHERE card_id IN (${placeholders})`,
      )
      .all(...cardIds) as { card_id: number; user_id: number }[];
    for (const r of cm) {
      const arr = membersByCard.get(r.card_id) ?? [];
      arr.push(r.user_id);
      membersByCard.set(r.card_id, arr);
    }
    const cc = db
      .prepare(`SELECT card_id, COUNT(*) AS c FROM comments WHERE card_id IN (${placeholders}) GROUP BY card_id`)
      .all(...cardIds) as { card_id: number; c: number }[];
    for (const r of cc) commentCountByCard.set(r.card_id, r.c);
    const ac = db
      .prepare(`SELECT card_id, COUNT(*) AS c FROM attachments WHERE card_id IN (${placeholders}) GROUP BY card_id`)
      .all(...cardIds) as { card_id: number; c: number }[];
    for (const r of ac) attachmentCountByCard.set(r.card_id, r.c);
  }

  const labelDTOs: LabelDTO[] = labels.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
  }));

  const listDTOs: ListDTO[] = lists.map((l) => ({
    id: l.id,
    boardId: l.board_id,
    title: l.title,
    position: l.position,
    isArchived: !!l.is_archived,
    cards: (cardsByList.get(l.id) ?? []).map((c) => ({
      id: c.id,
      listId: c.list_id,
      title: c.title,
      description: c.description ?? "",
      position: c.position,
      dueDate: c.due_date,
      isArchived: !!c.is_archived,
      coverColor: c.cover_color,
      labels: labelsByCard.get(c.id) ?? [],
      memberIds: membersByCard.get(c.id) ?? [],
      commentCount: commentCountByCard.get(c.id) ?? 0,
      attachmentCount: attachmentCountByCard.get(c.id) ?? 0,
    })),
  }));

  return {
    board: {
      id: board.id,
      title: board.title,
      description: board.description ?? "",
      background: board.background,
      isStarred: !!board.is_starred,
      isArchived: !!board.is_archived,
    },
    labels: labelDTOs,
    lists: listDTOs,
    members,
  };
}

export async function getArchivedCards(boardId: number): Promise<ArchivedCardDTO[]> {
  const session = await requireSession();
  const board = ownedBoard(boardId, session.userId);
  if (!board) throw new Error("Доска не найдена");
  const db = getDb();
  const lists = db.prepare("SELECT id, title FROM lists WHERE board_id = ?").all(boardId) as { id: number; title: string }[];
  const listTitleMap = new Map(lists.map((l) => [l.id, l.title]));
  const listIds = lists.map((l) => l.id);
  if (!listIds.length) return [];
  const placeholders = listIds.map(() => "?").join(",");
  const cards = db
    .prepare(`SELECT * FROM cards WHERE list_id IN (${placeholders}) AND is_archived = 1 ORDER BY updated_at DESC, id DESC`)
    .all(...listIds) as CardRow[];
  // labels for these cards
  const cardIds = cards.map((c) => c.id);
  const labelsByCard = new Map<number, LabelDTO[]>();
  if (cardIds.length) {
    const ph = cardIds.map(() => "?").join(",");
    const cl = db
      .prepare(`SELECT cl.card_id, l.id, l.name, l.color FROM card_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.card_id IN (${ph})`)
      .all(...cardIds) as { card_id: number; id: number; name: string; color: string }[];
    for (const r of cl) {
      const arr = labelsByCard.get(r.card_id) ?? [];
      arr.push({ id: r.id, name: r.name, color: r.color });
      labelsByCard.set(r.card_id, arr);
    }
  }
  return cards.map((c) => ({
    card: {
      id: c.id,
      listId: c.list_id,
      title: c.title,
      description: c.description ?? "",
      position: c.position,
      dueDate: c.due_date,
      isArchived: true,
      coverColor: c.cover_color,
      labels: labelsByCard.get(c.id) ?? [],
      memberIds: [],
      commentCount: 0,
      attachmentCount: 0,
    },
    listTitle: listTitleMap.get(c.list_id) ?? "",
  }));
}
  const boardSchema = z.object({
    title: z.string().trim().min(1, "Название доски обязательно").max(80),
  description: z.string().trim().max(500).optional().default(""),
  background: z.string().trim().max(40).optional().default("default"),
});

export async function createBoard(
  title: string,
  description = "",
  background = "default",
): Promise<number> {
  const session = await requireSession();
  const parsed = boardSchema.safeParse({ title, description, background });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO boards (owner_id, title, description, background) VALUES (?, ?, ?, ?)",
    )
    .run(session.userId, parsed.data.title, parsed.data.description, parsed.data.background);
  const boardId = Number(result.lastInsertRowid);
  // seed default labels (Trello style)
  const defaultLabels = [
    { name: "", color: "#61bd4f" },
    { name: "", color: "#f2d600" },
    { name: "", color: "#ff9f1a" },
    { name: "", color: "#eb5a46" },
    { name: "", color: "#c377e0" },
    { name: "", color: "#0079bf" },
  ];
  const ins = db.prepare("INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)");
  const tx = db.transaction(() => defaultLabels.forEach((l) => ins.run(boardId, l.name, l.color)));
  tx();
  revalidatePath("/boards");
  return boardId;
}

export async function updateBoard(
  id: number,
  patch: { title?: string; description?: string; background?: string; isStarred?: boolean; isArchived?: boolean },
): Promise<void> {
  const session = await requireSession();
  const board = ownedBoard(id, session.userId);
  if (!board) throw new Error("Доска не найдена");
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    const p = z.string().trim().min(1).max(80).safeParse(patch.title);
    if (!p.success) throw new Error(p.error.issues[0]?.message);
    fields.push("title = ?");
    values.push(p.data);
  }
  if (patch.description !== undefined) {
    fields.push("description = ?");
    values.push(patch.description);
  }
  if (patch.background !== undefined) {
    fields.push("background = ?");
    values.push(patch.background);
  }
  if (patch.isStarred !== undefined) {
    fields.push("is_starred = ?");
    values.push(patch.isStarred ? 1 : 0);
  }
  if (patch.isArchived !== undefined) {
    fields.push("is_archived = ?");
    values.push(patch.isArchived ? 1 : 0);
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE boards SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  revalidatePath("/boards");
  revalidatePath(`/board/${id}`);
}

export async function deleteBoard(id: number): Promise<void> {
  const session = await requireSession();
  const board = ownedBoard(id, session.userId);
  if (!board) throw new Error("Доска не найдена");
  getDb().prepare("DELETE FROM boards WHERE id = ?").run(id);
  revalidatePath("/boards");
}

/* ---------------- lists ---------------- */

export async function createList(boardId: number, title: string): Promise<void> {
  const session = await requireSession();
  const board = ownedBoard(boardId, session.userId);
  if (!board) throw new Error("Доска не найдена");
  const parsed = columnSchema.safeParse({ title });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  const db = getDb();
  const max = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM lists WHERE board_id = ?")
    .get(boardId) as { m: number };
  db.prepare("INSERT INTO lists (board_id, title, position) VALUES (?, ?, ?)").run(
    boardId,
    parsed.data.title,
    max.m + 1,
  );
  revalidatePath(`/board/${boardId}`);
}

export async function updateList(id: number, title: string): Promise<void> {
  const session = await requireSession();
  const list = listOwned(id, session.userId);
  if (!list) throw new Error("Список не найден");
  const parsed = columnSchema.safeParse({ title });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  getDb()
    .prepare("UPDATE lists SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .run(parsed.data.title, id);
  revalidatePath(`/board/${list.board_id}`);
}

export async function deleteList(id: number): Promise<void> {
  const session = await requireSession();
  const list = listOwned(id, session.userId);
  if (!list) throw new Error("Список не найден");
  getDb().prepare("DELETE FROM lists WHERE id = ?").run(id);
  revalidatePath(`/board/${list.board_id}`);
}

export async function archiveList(id: number, archived: boolean): Promise<void> {
  const session = await requireSession();
  const list = listOwned(id, session.userId);
  if (!list) throw new Error("Список не найден");
  getDb()
    .prepare("UPDATE lists SET is_archived = ?, updated_at = datetime('now') WHERE id = ?")
    .run(archived ? 1 : 0, id);
  revalidatePath(`/board/${list.board_id}`);
}

export async function moveList(listId: number, toIndex: number): Promise<void> {
  const session = await requireSession();
  const list = listOwned(listId, session.userId);
  if (!list) throw new Error("Список не найден");
  const db = getDb();
  const lists = db
    .prepare("SELECT id FROM lists WHERE board_id = ? AND is_archived = 0 ORDER BY position ASC, id ASC")
    .all(list.board_id) as { id: number }[];
  const filtered = lists.filter((l) => l.id !== listId);
  const clamped = Math.max(0, Math.min(toIndex, filtered.length));
  filtered.splice(clamped, 0, { id: listId });
  const tx = db.transaction(() => {
    filtered.forEach((l, idx) => {
      db.prepare("UPDATE lists SET position = ? WHERE id = ?").run(idx, l.id);
    });
  });
  tx();
  revalidatePath(`/board/${list.board_id}`);
}

/* ---------------- cards ---------------- */

export async function createCard(listId: number, title: string, description = ""): Promise<number> {
  const session = await requireSession();
  const list = listOwned(listId, session.userId);
  if (!list) throw new Error("Список не найден");
  const parsed = cardSchema.safeParse({ title, description });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  const db = getDb();
  const max = db
    .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM cards WHERE list_id = ?")
    .get(listId) as { m: number };
  const result = db
    .prepare(
      "INSERT INTO cards (list_id, title, description, position, created_by) VALUES (?, ?, ?, ?, ?)",
    )
    .run(listId, parsed.data.title, parsed.data.description, max.m + 1, session.userId);
  revalidatePath(`/board/${list.board_id}`);
  return Number(result.lastInsertRowid);
}

export async function updateCard(
  id: number,
  patch: { title?: string; description?: string; dueDate?: string | null; coverColor?: string | null },
): Promise<void> {
  const session = await requireSession();
  const db = getDb();
  const card = db
    .prepare(
      `SELECT c.* FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE c.id = ? AND b.owner_id = ?`,
    )
    .get(id, session.userId) as CardRow | undefined;
  if (!card) throw new Error("Карточка не найдена");
  const list = listOwned(card.list_id, session.userId)!;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    const p = z.string().trim().min(1).max(120).safeParse(patch.title);
    if (!p.success) throw new Error(p.error.issues[0]?.message);
    fields.push("title = ?");
    values.push(p.data);
  }
  if (patch.description !== undefined) {
    fields.push("description = ?");
    values.push(patch.description);
  }
  if (patch.dueDate !== undefined) {
    fields.push("due_date = ?");
    values.push(patch.dueDate);
  }
  if (patch.coverColor !== undefined) {
    fields.push("cover_color = ?");
    values.push(patch.coverColor);
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE cards SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  revalidatePath(`/board/${list.board_id}`);
}

export async function deleteCard(id: number): Promise<void> {
  const session = await requireSession();
  const db = getDb();
  const card = db
    .prepare(
      `SELECT c.*, l.board_id FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE c.id = ? AND b.owner_id = ?`,
    )
    .get(id, session.userId) as (CardRow & { board_id: number }) | undefined;
  if (!card) throw new Error("Карточка не найдена");
  db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  revalidatePath(`/board/${card.board_id}`);
}

export async function archiveCard(id: number, archived: boolean): Promise<void> {
  const session = await requireSession();
  const db = getDb();
  const card = db
    .prepare(
      `SELECT c.*, l.board_id FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE c.id = ? AND b.owner_id = ?`,
    )
    .get(id, session.userId) as (CardRow & { board_id: number }) | undefined;
  if (!card) throw new Error("Карточка не найдена");
  db.prepare("UPDATE cards SET is_archived = ?, updated_at = datetime('now') WHERE id = ?").run(
    archived ? 1 : 0,
    id,
  );
  revalidatePath(`/board/${card.board_id}`);
}

export async function moveCard(cardId: number, toListId: number, toIndex: number): Promise<void> {
  const session = await requireSession();
  const db = getDb();
  const card = db
    .prepare(
      `SELECT c.* FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE c.id = ? AND b.owner_id = ?`,
    )
    .get(cardId, session.userId) as CardRow | undefined;
  if (!card) throw new Error("Карточка не найдена");
  const toList = listOwned(toListId, session.userId);
  if (!toList) throw new Error("Список не найден");

  const fromListId = card.list_id;
  const fromBoardId = boardIdForList(fromListId, session.userId)!;

  const tx = db.transaction(() => {
    if (fromListId !== toListId) {
      const srcCards = db
        .prepare("SELECT id FROM cards WHERE list_id = ? AND id != ? AND is_archived = 0 ORDER BY position ASC, id ASC")
        .all(fromListId, cardId) as { id: number }[];
      srcCards.forEach((c, idx) => {
        db.prepare("UPDATE cards SET position = ? WHERE id = ?").run(idx, c.id);
      });
    }

    const destCards = db
      .prepare("SELECT id FROM cards WHERE list_id = ? AND id != ? AND is_archived = 0 ORDER BY position ASC, id ASC")
      .all(toListId, cardId) as { id: number }[];

    const clampedIndex = Math.max(0, Math.min(toIndex, destCards.length));
    destCards.splice(clampedIndex, 0, { id: cardId });

    db.prepare("UPDATE cards SET list_id = ? WHERE id = ?").run(toListId, cardId);
    destCards.forEach((c, idx) => {
      db.prepare("UPDATE cards SET position = ?, list_id = ? WHERE id = ?").run(idx, toListId, c.id);
    });
  });
  tx();
  revalidatePath(`/board/${fromBoardId}`);
  if (boardIdForList(toListId, session.userId) !== fromBoardId) {
    revalidatePath(`/board/${boardIdForList(toListId, session.userId)!}`);
  }
}
