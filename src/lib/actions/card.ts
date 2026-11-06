"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { CardRow } from "@/lib/db";
import { z } from "zod";

/* ---------- helpers ---------- */

function boardIdForCard(cardId: number, userId: number): number | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT l.board_id FROM cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE c.id = ? AND b.owner_id = ?`,
    )
    .get(cardId, userId) as { board_id: number } | undefined;
  return row?.board_id;
}

function ensureCardOwner(cardId: number, userId: number): number {
  const bid = boardIdForCard(cardId, userId);
  if (!bid) throw new Error("Карточка не найдена");
  return bid;
}

/* ---------- labels ---------- */

export async function getLabels(boardId: number) {
  const session = await requireSession();
  const db = getDb();
  // ownership
  const b = db.prepare("SELECT id FROM boards WHERE id = ? AND owner_id = ?").get(boardId, session.userId);
  if (!b) throw new Error("Доска не найдена");
  return db.prepare("SELECT id, name, color FROM labels WHERE board_id = ? ORDER BY id ASC").all(boardId) as {
    id: number; name: string; color: string;
  }[];
}

export async function createLabel(boardId: number, name: string, color: string) {
  const session = await requireSession();
  const db = getDb();
  const b = db.prepare("SELECT id FROM boards WHERE id = ? AND owner_id = ?").get(boardId, session.userId);
  if (!b) throw new Error("Доска не найдена");
  const parsedName = z.string().trim().max(40).safeParse(name);
  if (!parsedName.success) throw new Error("Некорректное имя метки");
  const parsedColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).safeParse(color);
  if (!parsedColor.success) throw new Error("Некорректный цвет");
  const r = db.prepare("INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)").run(boardId, parsedName.data, parsedColor.data);
  revalidatePath(`/board/${boardId}`);
  return Number(r.lastInsertRowid);
}

export async function updateLabel(labelId: number, patch: { name?: string; color?: string }) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare("SELECT l.*, b.owner_id FROM labels l JOIN boards b ON b.id = l.board_id WHERE l.id = ?")
    .get(labelId) as { id: number; board_id: number; owner_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Метка не найдена");
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    const p = z.string().trim().max(40).safeParse(patch.name);
    if (!p.success) throw new Error("Некорректное имя");
    fields.push("name = ?");
    values.push(p.data);
  }
  if (patch.color !== undefined) {
    const p = z.string().regex(/^#[0-9a-fA-F]{6}$/).safeParse(patch.color);
    if (!p.success) throw new Error("Некорректный цвет");
    fields.push("color = ?");
    values.push(p.data);
  }
  if (!fields.length) return;
  values.push(labelId);
  db.prepare(`UPDATE labels SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  revalidatePath(`/board/${row.board_id}`);
}

export async function deleteLabel(labelId: number) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare("SELECT l.board_id, b.owner_id FROM labels l JOIN boards b ON b.id = l.board_id WHERE l.id = ?")
    .get(labelId) as { board_id: number; owner_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Метка не найдена");
  db.prepare("DELETE FROM labels WHERE id = ?").run(labelId);
  revalidatePath(`/board/${row.board_id}`);
}

export async function addLabelToCard(cardId: number, labelId: number) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  const db = getDb();
  // ensure label belongs to same board
  const label = db
    .prepare("SELECT board_id FROM labels WHERE id = ?")
    .get(labelId) as { board_id: number } | undefined;
  if (!label || label.board_id !== boardId) throw new Error("Метка не найдена");
  db.prepare("INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)").run(cardId, labelId);
  revalidatePath(`/board/${boardId}`);
}

export async function removeLabelFromCard(cardId: number, labelId: number) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  getDb().prepare("DELETE FROM card_labels WHERE card_id = ? AND label_id = ?").run(cardId, labelId);
  revalidatePath(`/board/${boardId}`);
}

/* ---------- members ---------- */

export async function addMemberToCard(cardId: number, userId: number) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  const db = getDb();
  // user must be board member or owner
  const ok = db
    .prepare(
      `SELECT 1 FROM boards b LEFT JOIN board_members bm ON bm.board_id = b.id WHERE b.id = ? AND (b.owner_id = ? OR bm.user_id = ?)`,
    )
    .get(boardId, userId, userId);
  if (!ok) throw new Error("Пользователь не является участником доски");
  db.prepare("INSERT OR IGNORE INTO card_members (card_id, user_id) VALUES (?, ?)").run(cardId, userId);
  revalidatePath(`/board/${boardId}`);
}

export async function removeMemberFromCard(cardId: number, userId: number) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  getDb().prepare("DELETE FROM card_members WHERE card_id = ? AND user_id = ?").run(cardId, userId);
  revalidatePath(`/board/${boardId}`);
}

/* ---------- checklists ---------- */

export async function createChecklist(cardId: number, title: string) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  const parsed = z.string().trim().min(1).max(80).safeParse(title);
  if (!parsed.success) throw new Error("Название чек-листа обязательно");
  const db = getDb();
  const max = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM checklists WHERE card_id = ?").get(cardId) as { m: number };
  db.prepare("INSERT INTO checklists (card_id, title, position) VALUES (?, ?, ?)").run(cardId, parsed.data, max.m + 1);
  revalidatePath(`/board/${boardId}`);
}

export async function deleteChecklist(checklistId: number) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT cl.card_id, c.list_id, l.board_id, b.owner_id FROM checklists cl JOIN cards c ON c.id = cl.card_id JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE cl.id = ?`,
    )
    .get(checklistId) as { card_id: number; board_id: number; owner_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Чек-лист не найден");
  db.prepare("DELETE FROM checklists WHERE id = ?").run(checklistId);
  revalidatePath(`/board/${row.board_id}`);
}

export async function createChecklistItem(checklistId: number, text: string) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT cl.id, cl.card_id, c.list_id, l.board_id, b.owner_id FROM checklists cl JOIN cards c ON c.id = cl.card_id JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE cl.id = ?`,
    )
    .get(checklistId) as { card_id: number; board_id: number; owner_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Чек-лист не найден");
  const parsed = z.string().trim().min(1).max(200).safeParse(text);
  if (!parsed.success) throw new Error("Текст пункта обязателен");
  const max = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM checklist_items WHERE checklist_id = ?").get(checklistId) as { m: number };
  db.prepare("INSERT INTO checklist_items (checklist_id, text, position) VALUES (?, ?, ?)").run(checklistId, parsed.data, max.m + 1);
  revalidatePath(`/board/${row.board_id}`);
}

export async function toggleChecklistItem(itemId: number, checked: boolean) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ci.id, cl.card_id, c.list_id, l.board_id, b.owner_id FROM checklist_items ci JOIN checklists cl ON cl.id = ci.checklist_id JOIN cards c ON c.id = cl.card_id JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE ci.id = ?`,
    )
    .get(itemId) as { board_id: number; owner_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Пункт не найден");
  db.prepare("UPDATE checklist_items SET is_checked = ? WHERE id = ?").run(checked ? 1 : 0, itemId);
  revalidatePath(`/board/${row.board_id}`);
}

export async function deleteChecklistItem(itemId: number) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ci.id, cl.card_id, c.list_id, l.board_id, b.owner_id FROM checklist_items ci JOIN checklists cl ON cl.id = ci.checklist_id JOIN cards c ON c.id = cl.card_id JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE ci.id = ?`,
    )
    .get(itemId) as { board_id: number; owner_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Пункт не найден");
  db.prepare("DELETE FROM checklist_items WHERE id = ?").run(itemId);
  revalidatePath(`/board/${row.board_id}`);
}

/* ---------- comments ---------- */

export async function addComment(cardId: number, text: string) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  const parsed = z.string().trim().min(1).max(2000).safeParse(text);
  if (!parsed.success) throw new Error("Комментарий не может быть пустым");
  getDb()
    .prepare("INSERT INTO comments (card_id, user_id, text) VALUES (?, ?, ?)")
    .run(cardId, session.userId, parsed.data);
  revalidatePath(`/board/${boardId}`);
}

export async function deleteComment(commentId: number) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT co.id, co.card_id, c.list_id, l.board_id, b.owner_id, co.user_id FROM comments co JOIN cards c ON c.id = co.card_id JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE co.id = ?`,
    )
    .get(commentId) as { board_id: number; owner_id: number; user_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Комментарий не найден");
  if (row.user_id !== session.userId) throw new Error("Нельзя удалить чужой комментарий");
  db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
  revalidatePath(`/board/${row.board_id}`);
}

/* ---------- attachments ---------- */

export async function addAttachment(cardId: number, name: string, url: string) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  const parsedName = z.string().trim().min(1).max(120).safeParse(name);
  const parsedUrl = z.string().trim().url().safeParse(url);
  if (!parsedName.success) throw new Error("Имя вложения обязательно");
  if (!parsedUrl.success) throw new Error("Некорректный URL");
  getDb()
    .prepare("INSERT INTO attachments (card_id, name, url) VALUES (?, ?, ?)")
    .run(cardId, parsedName.data, parsedUrl.data);
  revalidatePath(`/board/${boardId}`);
}

export async function deleteAttachment(attachmentId: number) {
  const session = await requireSession();
  const db = getDb();
  const row = db
    .prepare(
      `SELECT a.id, a.card_id, c.list_id, l.board_id, b.owner_id FROM attachments a JOIN cards c ON c.id = a.card_id JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id WHERE a.id = ?`,
    )
    .get(attachmentId) as { board_id: number; owner_id: number } | undefined;
  if (!row || row.owner_id !== session.userId) throw new Error("Вложение не найдено");
  db.prepare("DELETE FROM attachments WHERE id = ?").run(attachmentId);
  revalidatePath(`/board/${row.board_id}`);
}

/* ---------- card detail fetch ---------- */

export async function getCardDetail(cardId: number) {
  const session = await requireSession();
  const boardId = ensureCardOwner(cardId, session.userId);
  const db = getDb();
  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId) as CardRow;
  const labels = db
    .prepare(
      `SELECT l.id, l.name, l.color FROM card_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.card_id = ?`,
    )
    .all(cardId) as { id: number; name: string; color: string }[];
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.email FROM card_members cm JOIN users u ON u.id = cm.user_id WHERE cm.card_id = ?`,
    )
    .all(cardId) as { id: number; name: string; email: string }[];
  const checklists = db
    .prepare("SELECT * FROM checklists WHERE card_id = ? ORDER BY position ASC, id ASC")
    .all(cardId) as { id: number; title: string; position: number }[];
  const checklistsWithItems = checklists.map((cl) => ({
    id: cl.id,
    title: cl.title,
    position: cl.position,
    items: db
      .prepare("SELECT id, text, is_checked, position FROM checklist_items WHERE checklist_id = ? ORDER BY position ASC, id ASC")
      .all(cl.id) as { id: number; text: string; is_checked: number; position: number }[],
  }));
  const comments = db
    .prepare(
      `SELECT co.id, co.text, co.created_at, u.id AS user_id, u.name FROM comments co JOIN users u ON u.id = co.user_id WHERE co.card_id = ? ORDER BY co.created_at ASC`,
    )
    .all(cardId) as { id: number; text: string; created_at: string; user_id: number; name: string }[];
  const attachments = db
    .prepare("SELECT id, name, url, created_at FROM attachments WHERE card_id = ? ORDER BY created_at ASC")
    .all(cardId) as { id: number; name: string; url: string; created_at: string }[];
  return {
    card: {
      id: card.id,
      listId: card.list_id,
      title: card.title,
      description: card.description ?? "",
      dueDate: card.due_date,
      coverColor: card.cover_color,
      isArchived: !!card.is_archived,
    },
    boardId,
    labels,
    members,
    checklists: checklistsWithItems,
    comments,
    attachments,
  };
}
