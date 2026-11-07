"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  board: BoardDTO & { id: number };
  labels: LabelDTO[];
  lists: ListDTO[];
  members: { id: number; name: string; email: string }[];
};

export type ArchivedCardDTO = {
  card: CardDTO;
  listTitle: string;
};

/* ---------------- helpers ---------------- */

async function ownedBoard(boardId: number, userId: number) {
  return prisma.board.findFirst({ where: { id: boardId, ownerId: userId } });
}

async function listOwned(listId: number, userId: number) {
  return prisma.list.findFirst({
    where: { id: listId, board: { ownerId: userId } },
  });
}

/* ---------------- boards ---------------- */

export async function getBoards(): Promise<BoardDTO[]> {
  const session = await requireSession();
  const rows = await prisma.board.findMany({
    where: { ownerId: session.userId, isArchived: false },
    orderBy: [{ isStarred: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description ?? "",
    background: b.background,
    isStarred: b.isStarred,
    isArchived: b.isArchived,
  })) as any;
}

// Need BoardDTO include id? Original BoardDTO no id but getBoards returned id. Fix type.
// We'll adjust BoardDTO to include id.

export async function getArchivedBoards(): Promise<BoardDTO[]> {
  const session = await requireSession();
  const rows = await prisma.board.findMany({
    where: { ownerId: session.userId, isArchived: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description ?? "",
    background: b.background,
    isStarred: b.isStarred,
    isArchived: b.isArchived,
  })) as any;
}

export async function getBoard(id: number): Promise<BoardDetailDTO | null> {
  const session = await requireSession();
  const board = await prisma.board.findFirst({
    where: { id, ownerId: session.userId },
    include: {
      labels: { orderBy: { id: "asc" } },
      lists: {
        where: { isArchived: false },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          cards: {
            where: { isArchived: false },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              labels: { include: { label: true } },
              members: true,
              _count: { select: { comments: true, attachments: true } },
            },
          },
        },
      },
      members: { include: { user: true } },
    },
  });
  if (!board) return null;

  const owner = await prisma.user.findUnique({ where: { id: board.ownerId } });
  const members: { id: number; name: string; email: string }[] = [];
  if (owner) members.push({ id: owner.id, name: owner.name, email: owner.email });
  for (const bm of board.members) {
    if (!members.some((m) => m.id === bm.userId)) {
      const u = await prisma.user.findUnique({ where: { id: bm.userId } });
      if (u) members.push({ id: u.id, name: u.name, email: u.email });
    }
  }

  const labelDTOs: LabelDTO[] = board.labels.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
  }));

  const listDTOs: ListDTO[] = board.lists.map((l) => ({
    id: l.id,
    boardId: l.boardId,
    title: l.title,
    position: l.position,
    isArchived: l.isArchived,
    cards: l.cards.map((c) => ({
      id: c.id,
      listId: c.listId,
      title: c.title,
      description: c.description ?? "",
      position: c.position,
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      isArchived: c.isArchived,
      coverColor: c.coverColor,
      labels: c.labels.map((cl) => ({
        id: cl.label.id,
        name: cl.label.name,
        color: cl.label.color,
      })),
      memberIds: c.members.map((m) => m.userId),
      commentCount: c._count.comments,
      attachmentCount: c._count.attachments,
    })),
  }));

  return {
    board: {
      id: board.id,
      title: board.title,
      description: board.description ?? "",
      background: board.background,
      isStarred: board.isStarred,
      isArchived: board.isArchived,
    },
    labels: labelDTOs,
    lists: listDTOs,
    members,
  };
}

export async function getArchivedCards(boardId: number): Promise<ArchivedCardDTO[]> {
  const session = await requireSession();
  const board = await ownedBoard(boardId, session.userId);
  if (!board) throw new Error("Доска не найдена");
  const lists = await prisma.list.findMany({ where: { boardId }, select: { id: true, title: true } });
  const listTitleMap = new Map(lists.map((l) => [l.id, l.title]));
  const listIds = lists.map((l) => l.id);
  if (!listIds.length) return [];
  const cards = await prisma.card.findMany({
    where: { listId: { in: listIds }, isArchived: true },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: { labels: { include: { label: true } } },
  });
  return cards.map((c) => ({
    card: {
      id: c.id,
      listId: c.listId,
      title: c.title,
      description: c.description ?? "",
      position: c.position,
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      isArchived: true,
      coverColor: c.coverColor,
      labels: c.labels.map((cl) => ({ id: cl.label.id, name: cl.label.name, color: cl.label.color })),
      memberIds: [],
      commentCount: 0,
      attachmentCount: 0,
    },
    listTitle: listTitleMap.get(c.listId) ?? "",
  }));
}

export async function createBoard(title: string, description = "", background = "default"): Promise<number> {
  const session = await requireSession();
  const parsed = z.object({ title: z.string().trim().min(1).max(80), description: z.string().trim().max(500).optional().default(""), background: z.string().trim().max(40).optional().default("default") }).safeParse({ title, description, background });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  const board = await prisma.board.create({
    data: {
      ownerId: session.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      background: parsed.data.background,
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
    },
  });
  revalidatePath("/boards");
  return board.id;
}

export async function updateBoard(id: number, patch: { title?: string; description?: string; background?: string; isStarred?: boolean; isArchived?: boolean }): Promise<void> {
  const session = await requireSession();
  const board = await ownedBoard(id, session.userId);
  if (!board) throw new Error("Доска не найдена");
  const data: any = {};
  if (patch.title !== undefined) {
    const p = z.string().trim().min(1).max(80).safeParse(patch.title);
    if (!p.success) throw new Error(p.error.issues[0]?.message);
    data.title = p.data;
  }
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.background !== undefined) data.background = patch.background;
  if (patch.isStarred !== undefined) data.isStarred = patch.isStarred;
  if (patch.isArchived !== undefined) data.isArchived = patch.isArchived;
  if (Object.keys(data).length === 0) return;
  data.updatedAt = new Date();
  await prisma.board.update({ where: { id }, data });
  revalidatePath("/boards");
  revalidatePath(`/board/${id}`);
}

export async function deleteBoard(id: number): Promise<void> {
  const session = await requireSession();
  const board = await ownedBoard(id, session.userId);
  if (!board) throw new Error("Доска не найдена");
  await prisma.board.delete({ where: { id } });
  revalidatePath("/boards");
}

/* ---------------- lists ---------------- */

export async function createList(boardId: number, title: string): Promise<void> {
  const session = await requireSession();
  const board = await ownedBoard(boardId, session.userId);
  if (!board) throw new Error("Доска не найдена");
  const parsed = columnSchema.safeParse({ title });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  const max = await prisma.list.aggregate({ where: { boardId }, _max: { position: true } });
  await prisma.list.create({ data: { boardId, title: parsed.data.title, position: (max._max.position ?? -1) + 1 } });
  revalidatePath(`/board/${boardId}`);
}

export async function updateList(id: number, title: string): Promise<void> {
  const session = await requireSession();
  const list = await listOwned(id, session.userId);
  if (!list) throw new Error("Список не найден");
  const parsed = columnSchema.safeParse({ title });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  await prisma.list.update({ where: { id }, data: { title: parsed.data.title, updatedAt: new Date() } });
  revalidatePath(`/board/${list.boardId}`);
}

export async function deleteList(id: number): Promise<void> {
  const session = await requireSession();
  const list = await listOwned(id, session.userId);
  if (!list) throw new Error("Список не найден");
  await prisma.list.delete({ where: { id } });
  revalidatePath(`/board/${list.boardId}`);
}

export async function archiveList(id: number, archived: boolean): Promise<void> {
  const session = await requireSession();
  const list = await listOwned(id, session.userId);
  if (!list) throw new Error("Список не найден");
  await prisma.list.update({ where: { id }, data: { isArchived: archived, updatedAt: new Date() } });
  revalidatePath(`/board/${list.boardId}`);
}

export async function moveList(listId: number, toIndex: number): Promise<void> {
  const session = await requireSession();
  const list = await listOwned(listId, session.userId);
  if (!list) throw new Error("Список не найден");
  const lists = await prisma.list.findMany({ where: { boardId: list.boardId, isArchived: false }, orderBy: [{ position: "asc" }, { id: "asc" }] });
  const filtered = lists.filter((l) => l.id !== listId);
  const clamped = Math.max(0, Math.min(toIndex, filtered.length));
  filtered.splice(clamped, 0, list);
  await prisma.$transaction(filtered.map((l, idx) => prisma.list.update({ where: { id: l.id }, data: { position: idx } })));
  revalidatePath(`/board/${list.boardId}`);
}

/* ---------------- cards ---------------- */

export async function createCard(listId: number, title: string, description = ""): Promise<number> {
  const session = await requireSession();
  const list = await listOwned(listId, session.userId);
  if (!list) throw new Error("Список не найден");
  const parsed = cardSchema.safeParse({ title, description });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  const max = await prisma.card.aggregate({ where: { listId }, _max: { position: true } });
  const card = await prisma.card.create({
    data: { listId, title: parsed.data.title, description: parsed.data.description, position: (max._max.position ?? -1) + 1, createdById: session.userId },
  });
  revalidatePath(`/board/${list.boardId}`);
  return card.id;
}

export async function updateCard(id: number, patch: { title?: string; description?: string; dueDate?: string | null; coverColor?: string | null }): Promise<void> {
  const session = await requireSession();
  const card = await prisma.card.findFirst({ where: { id, list: { board: { ownerId: session.userId } } } });
  if (!card) throw new Error("Карточка не найдена");
  const list = await listOwned(card.listId, session.userId);
  const data: any = {};
  if (patch.title !== undefined) {
    const p = z.string().trim().min(1).max(120).safeParse(patch.title);
    if (!p.success) throw new Error(p.error.issues[0]?.message);
    data.title = p.data;
  }
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  if (patch.coverColor !== undefined) data.coverColor = patch.coverColor;
  if (Object.keys(data).length === 0) return;
  data.updatedAt = new Date();
  await prisma.card.update({ where: { id }, data });
  revalidatePath(`/board/${list!.boardId}`);
}

export async function deleteCard(id: number): Promise<void> {
  const session = await requireSession();
  const card = await prisma.card.findFirst({ where: { id, list: { board: { ownerId: session.userId } } }, include: { list: true } });
  if (!card) throw new Error("Карточка не найдена");
  await prisma.card.delete({ where: { id } });
  revalidatePath(`/board/${card.list.boardId}`);
}

export async function archiveCard(id: number, archived: boolean): Promise<void> {
  const session = await requireSession();
  const card = await prisma.card.findFirst({ where: { id, list: { board: { ownerId: session.userId } } }, include: { list: true } });
  if (!card) throw new Error("Карточка не найдена");
  await prisma.card.update({ where: { id }, data: { isArchived: archived, updatedAt: new Date() } });
  revalidatePath(`/board/${card.list.boardId}`);
}

export async function moveCard(cardId: number, toListId: number, toIndex: number): Promise<void> {
  const session = await requireSession();
  const card = await prisma.card.findFirst({ where: { id: cardId, list: { board: { ownerId: session.userId } } } });
  if (!card) throw new Error("Карточка не найдена");
  const toList = await listOwned(toListId, session.userId);
  if (!toList) throw new Error("Список не найден");

  const fromListId = card.listId;
  await prisma.$transaction(async (tx) => {
    if (fromListId !== toListId) {
      const srcCards = await tx.card.findMany({ where: { listId: fromListId, id: { not: cardId }, isArchived: false }, orderBy: [{ position: "asc" }, { id: "asc" }] });
      for (let i = 0; i < srcCards.length; i++) {
        await tx.card.update({ where: { id: srcCards[i].id }, data: { position: i } });
      }
    }
    const destCards = await tx.card.findMany({ where: { listId: toListId, id: { not: cardId }, isArchived: false }, orderBy: [{ position: "asc" }, { id: "asc" }] });
    const clamped = Math.max(0, Math.min(toIndex, destCards.length));
    destCards.splice(clamped, 0, card as any);
    await tx.card.update({ where: { id: cardId }, data: { listId: toListId } });
    for (let i = 0; i < destCards.length; i++) {
      await tx.card.update({ where: { id: destCards[i].id }, data: { position: i, listId: toListId } });
    }
  });

  const fromBoardId = (await prisma.list.findUnique({ where: { id: fromListId } }))!.boardId;
  revalidatePath(`/board/${fromBoardId}`);
  const toBoardId = toList.boardId;
  if (toBoardId !== fromBoardId) revalidatePath(`/board/${toBoardId}`);
}