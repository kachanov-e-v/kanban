"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

function boardIdForCard(cardId: number, userId: number): Promise<number | undefined> {
  return prisma.card
    .findFirst({ where: { id: cardId, list: { board: { ownerId: userId } } }, select: { list: { select: { boardId: true } } } })
    .then((c) => c?.list.boardId);
}

export async function getLabels(boardId: number) {
  const session = await requireSession();
  const b = await prisma.board.findFirst({ where: { id: boardId, ownerId: session.userId }, select: { id: true } });
  if (!b) throw new Error("Доска не найдена");
  return prisma.label.findMany({ where: { boardId }, orderBy: { id: "asc" }, select: { id: true, name: true, color: true } });
}

export async function createLabel(boardId: number, name: string, color: string) {
  const session = await requireSession();
  const b = await prisma.board.findFirst({ where: { id: boardId, ownerId: session.userId }, select: { id: true } });
  if (!b) throw new Error("Доска не найдена");
  const parsedName = z.string().trim().max(40).safeParse(name);
  if (!parsedName.success) throw new Error("Некорректное имя метки");
  const parsedColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).safeParse(color);
  if (!parsedColor.success) throw new Error("Некорректный цвет");
  const r = await prisma.label.create({ data: { boardId, name: parsedName.data, color: parsedColor.data } });
  revalidatePath(`/board/${boardId}`);
  return r.id;
}

export async function updateLabel(labelId: number, patch: { name?: string; color?: string }) {
  const session = await requireSession();
  const row = await prisma.label.findFirst({ where: { id: labelId, board: { ownerId: session.userId } }, select: { id: true, boardId: true } });
  if (!row) throw new Error("Метка не найдена");
  const data: any = {};
  if (patch.name !== undefined) {
    const p = z.string().trim().max(40).safeParse(patch.name);
    if (!p.success) throw new Error("Некорректное имя");
    data.name = p.data;
  }
  if (patch.color !== undefined) {
    const p = z.string().regex(/^#[0-9a-fA-F]{6}$/).safeParse(patch.color);
    if (!p.success) throw new Error("Некорректный цвет");
    data.color = p.data;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.label.update({ where: { id: labelId }, data });
  revalidatePath(`/board/${row.boardId}`);
}

export async function deleteLabel(labelId: number) {
  const session = await requireSession();
  const row = await prisma.label.findFirst({ where: { id: labelId, board: { ownerId: session.userId } }, select: { id: true, boardId: true } });
  if (!row) throw new Error("Метка не найдена");
  await prisma.label.delete({ where: { id: labelId } });
  revalidatePath(`/board/${row.boardId}`);
}

export async function addLabelToCard(cardId: number, labelId: number) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  const label = await prisma.label.findFirst({ where: { id: labelId, boardId } });
  if (!label) throw new Error("Метка не найдена");
  await prisma.cardLabel.upsert({ where: { cardId_labelId: { cardId, labelId } }, create: { cardId, labelId }, update: {} });
  revalidatePath(`/board/${boardId}`);
}

export async function removeLabelFromCard(cardId: number, labelId: number) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  await prisma.cardLabel.deleteMany({ where: { cardId, labelId } });
  revalidatePath(`/board/${boardId}`);
}

export async function addMemberToCard(cardId: number, userId: number) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  const ok = await prisma.board.findFirst({ where: { id: boardId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] } });
  if (!ok) throw new Error("Пользователь не является участником доски");
  await prisma.cardMember.upsert({ where: { cardId_userId: { cardId, userId } }, create: { cardId, userId }, update: {} });
  revalidatePath(`/board/${boardId}`);
}

export async function removeMemberFromCard(cardId: number, userId: number) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  await prisma.cardMember.deleteMany({ where: { cardId, userId } });
  revalidatePath(`/board/${boardId}`);
}

export async function createChecklist(cardId: number, title: string) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  const parsed = z.string().trim().min(1).max(80).safeParse(title);
  if (!parsed.success) throw new Error("Название чек-листа обязательно");
  const max = await prisma.checklist.aggregate({ where: { cardId }, _max: { position: true } });
  await prisma.checklist.create({ data: { cardId, title: parsed.data, position: (max._max.position ?? -1) + 1 } });
  revalidatePath(`/board/${boardId}`);
}

export async function deleteChecklist(checklistId: number) {
  const session = await requireSession();
  const row = await prisma.checklist.findFirst({ where: { id: checklistId, card: { list: { board: { ownerId: session.userId } } } }, select: { id: true, card: { select: { list: { select: { boardId: true } } } } } });
  if (!row) throw new Error("Чек-лист не найден");
  await prisma.checklist.delete({ where: { id: checklistId } });
  revalidatePath(`/board/${row.card.list.boardId}`);
}

export async function createChecklistItem(checklistId: number, text: string) {
  const session = await requireSession();
  const row = await prisma.checklist.findFirst({ where: { id: checklistId, card: { list: { board: { ownerId: session.userId } } } }, select: { id: true, card: { select: { list: { select: { boardId: true } } } } } });
  if (!row) throw new Error("Чек-лист не найден");
  const parsed = z.string().trim().min(1).max(200).safeParse(text);
  if (!parsed.success) throw new Error("Текст пункта обязателен");
  const max = await prisma.checklistItem.aggregate({ where: { checklistId }, _max: { position: true } });
  await prisma.checklistItem.create({ data: { checklistId, text: parsed.data, position: (max._max.position ?? -1) + 1 } });
  revalidatePath(`/board/${row.card.list.boardId}`);
}

export async function toggleChecklistItem(itemId: number, checked: boolean) {
  const session = await requireSession();
  const row = await prisma.checklistItem.findFirst({ where: { id: itemId, checklist: { card: { list: { board: { ownerId: session.userId } } } } }, select: { id: true, checklist: { select: { card: { select: { list: { select: { boardId: true } } } } } } } });
  if (!row) throw new Error("Пункт не найден");
  await prisma.checklistItem.update({ where: { id: itemId }, data: { isChecked: checked } });
  revalidatePath(`/board/${row.checklist.card.list.boardId}`);
}

export async function deleteChecklistItem(itemId: number) {
  const session = await requireSession();
  const row = await prisma.checklistItem.findFirst({ where: { id: itemId, checklist: { card: { list: { board: { ownerId: session.userId } } } } }, select: { id: true, checklist: { select: { card: { select: { list: { select: { boardId: true } } } } } } } });
  if (!row) throw new Error("Пункт не найден");
  await prisma.checklistItem.delete({ where: { id: itemId } });
  revalidatePath(`/board/${row.checklist.card.list.boardId}`);
}

export async function addComment(cardId: number, text: string) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  const parsed = z.string().trim().min(1).max(2000).safeParse(text);
  if (!parsed.success) throw new Error("Комментарий не может быть пустым");
  await prisma.comment.create({ data: { cardId, userId: session.userId, text: parsed.data } });
  revalidatePath(`/board/${boardId}`);
}

export async function deleteComment(commentId: number) {
  const session = await requireSession();
  const row = await prisma.comment.findFirst({ where: { id: commentId, card: { list: { board: { ownerId: session.userId } } } }, select: { id: true, userId: true, card: { select: { list: { select: { boardId: true } } } } } });
  if (!row) throw new Error("Комментарий не найден");
  if (row.userId !== session.userId) throw new Error("Нельзя удалить чужой комментарий");
  await prisma.comment.delete({ where: { id: commentId } });
  revalidatePath(`/board/${row.card.list.boardId}`);
}

export async function addAttachment(cardId: number, name: string, url: string) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  const parsedName = z.string().trim().min(1).max(120).safeParse(name);
  const parsedUrl = z.string().trim().url().safeParse(url);
  if (!parsedName.success) throw new Error("Имя вложения обязательно");
  if (!parsedUrl.success) throw new Error("Некорректный URL");
  await prisma.attachment.create({ data: { cardId, name: parsedName.data, url: parsedUrl.data } });
  revalidatePath(`/board/${boardId}`);
}

export async function deleteAttachment(attachmentId: number) {
  const session = await requireSession();
  const row = await prisma.attachment.findFirst({ where: { id: attachmentId, card: { list: { board: { ownerId: session.userId } } } }, select: { id: true, card: { select: { list: { select: { boardId: true } } } } } });
  if (!row) throw new Error("Вложение не найдено");
  await prisma.attachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/board/${row.card.list.boardId}`);
}

export async function getCardDetail(cardId: number) {
  const session = await requireSession();
  const boardId = await boardIdForCard(cardId, session.userId);
  if (!boardId) throw new Error("Карточка не найдена");
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw new Error("Карточка не найдена");
  const labels = await prisma.cardLabel.findMany({ where: { cardId }, include: { label: true } });
  const members = await prisma.cardMember.findMany({ where: { cardId }, include: { user: true } });
  const checklists = await prisma.checklist.findMany({ where: { cardId }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  const checklistsWithItems = await Promise.all(checklists.map(async (cl) => ({
    id: cl.id,
    title: cl.title,
    position: cl.position,
    items: await prisma.checklistItem.findMany({ where: { checklistId: cl.id }, orderBy: [{ position: "asc" }, { id: "asc" }] }).then((items) => items.map((i) => ({ id: i.id, text: i.text, is_checked: i.isChecked ? 1 : 0, position: i.position }))),
  })));
  const comments = await prisma.comment.findMany({ where: { cardId }, orderBy: { createdAt: "asc" }, include: { user: true } });
  const attachments = await prisma.attachment.findMany({ where: { cardId }, orderBy: { createdAt: "asc" } });
  return {
    card: {
      id: card.id,
      listId: card.listId,
      title: card.title,
      description: card.description ?? "",
      dueDate: card.dueDate ? card.dueDate.toISOString() : null,
      coverColor: card.coverColor,
      isArchived: card.isArchived,
    },
    boardId,
    labels: labels.map((cl) => ({ id: cl.label.id, name: cl.label.name, color: cl.label.color })),
    members: members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email })),
    checklists: checklistsWithItems,
    comments: comments.map((c) => ({ id: c.id, text: c.text, created_at: c.createdAt.toISOString(), user_id: c.userId, name: c.user.name })),
    attachments: attachments.map((a) => ({ id: a.id, name: a.name, url: a.url, created_at: a.createdAt.toISOString() })),
  };
}