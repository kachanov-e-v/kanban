"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Archive, Trash2, Plus, Pencil } from "lucide-react";
import { createBoard, updateBoard, deleteBoard } from "@/lib/actions/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { BoardDTO } from "@/lib/actions/board";

const BG_OPTIONS = [
  { key: "default", color: "#0079bf" },
  { key: "green", color: "#519839" },
  { key: "orange", color: "#d29034" },
  { key: "red", color: "#b04632" },
  { key: "purple", color: "#89609e" },
  { key: "pink", color: "#cd5a91" },
  { key: "lime", color: "#4bbf6b" },
  { key: "sky", color: "#00aecc" },
];

function bgStyleColor(bg: string) {
  const map: Record<string, string> = {
    default: "#0079bf",
    green: "#519839",
    orange: "#d29034",
    red: "#b04632",
    purple: "#89609e",
    pink: "#cd5a91",
    lime: "#4bbf6b",
    sky: "#00aecc",
  };
  return map[bg] ?? "#0079bf";
}

export function BoardsView({
  initialBoards,
  initialArchived,
}: {
  initialBoards: BoardDTO[];
  initialArchived: BoardDTO[];
}) {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardDTO[]>(initialBoards);
  const [archived, setArchived] = useState<BoardDTO[]>(initialArchived);
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [bg, setBg] = useState("default");
  const [isPending, startTransition] = useTransition();
  const [confirmBoard, setConfirmBoard] = useState<BoardDTO | null>(null);

  const [editBoard, setEditBoard] = useState<BoardDTO | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBg, setEditBg] = useState("default");
  const [editPending, setEditPending] = useState(false);

  const [prevBoards, setPrevBoards] = useState<BoardDTO[]>(initialBoards);
  const [prevArchived, setPrevArchived] = useState<BoardDTO[]>(initialArchived);
  if (initialBoards !== prevBoards) {
    setPrevBoards(initialBoards);
    setBoards(initialBoards);
  }
  if (initialArchived !== prevArchived) {
    setPrevArchived(initialArchived);
    setArchived(initialArchived);
  }

  function handleCreate() {
    const t = title.trim();
    if (!t) return;
    startTransition(async () => {
      try {
        const id = await createBoard(t, "", bg);
        setCreateOpen(false);
        setTitle("");
        setBg("default");
        router.push(`/board/${id}`);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function toggleStar(b: BoardDTO) {
    const next = !b.isStarred;
    setBoards((prev) =>
      prev.map((x) => (x.id === b.id ? { ...x, isStarred: next } : x)),
    );
    startTransition(async () => {
      try {
        await updateBoard(b.id, { isStarred: next });
        router.refresh();
      } catch (e) {
        console.error(e);
        setBoards((prev) =>
          prev.map((x) => (x.id === b.id ? { ...x, isStarred: b.isStarred } : x)),
        );
      }
    });
  }

  function archiveBoard(b: BoardDTO, archivedFlag: boolean) {
    startTransition(async () => {
      try {
        await updateBoard(b.id, { isArchived: archivedFlag });
        if (archivedFlag) {
          setBoards((prev) => prev.filter((x) => x.id !== b.id));
          setArchived((prev) => [{ ...b, isArchived: true }, ...prev]);
        } else {
          setArchived((prev) => prev.filter((x) => x.id !== b.id));
          setBoards((prev) => [{ ...b, isArchived: false }, ...prev]);
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  function removeBoard(b: BoardDTO) {
    setConfirmBoard(b);
  }

  function confirmRemoveBoard() {
    if (!confirmBoard) return;
    const b = confirmBoard;
    setConfirmBoard(null);
    startTransition(async () => {
      try {
        await deleteBoard(b.id);
        setBoards((prev) => prev.filter((x) => x.id !== b.id));
        setArchived((prev) => prev.filter((x) => x.id !== b.id));
      } catch (e) {
        console.error(e);
      }
    });
  }

  function openEditBoard(b: BoardDTO) {
    setEditBoard(b);
    setEditTitle(b.title);
    setEditDescription(b.description);
    setEditBg(b.background);
  }

  async function saveEditBoard() {
    if (!editBoard) return;
    const t = editTitle.trim();
    if (!t) return;
    setEditPending(true);
    try {
      await updateBoard(editBoard.id, {
        title: t,
        description: editDescription.trim(),
        background: editBg,
      });
      setBoards((prev) =>
        prev.map((x) =>
          x.id === editBoard.id
            ? { ...x, title: t, description: editDescription.trim(), background: editBg }
            : x,
        ),
      );
      setEditBoard(null);
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setEditPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="type-headline-small text-on-surface">Ваши доски</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Создать доску
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {boards.map((b) => (
          <div
            key={b.id}
            className="group relative overflow-hidden rounded-radius-lg bg-surface border-[3px] border-outline shadow-level1 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-level2"
          >
            <div className="h-3 border-b-[3px] border-outline" style={{ backgroundColor: bgStyleColor(b.background) }} />
            <Link href={`/board/${b.id}`} className="block p-4 min-h-[96px]">
              <span className="type-title-medium text-on-surface">{b.title}</span>
              {b.description && (
                <p className="type-body-medium mt-1 text-on-surface/70 line-clamp-2">{b.description}</p>
              )}
            </Link>
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => openEditBoard(b)}
                aria-label="Редактировать доску"
                className="rounded-radius-sm p-1 bg-surface border-[2px] border-outline text-on-surface hover:bg-primary/20"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => toggleStar(b)}
                aria-label={b.isStarred ? "Убрать из избранного" : "В избранное"}
                className="rounded-radius-sm p-1 bg-surface border-[2px] border-outline text-on-surface hover:bg-primary/20"
              >
                <Star className={"h-4 w-4 " + (b.isStarred ? "fill-current" : "")} />
              </button>
              <button
                type="button"
                onClick={() => archiveBoard(b, true)}
                aria-label="Архивировать"
                className="rounded-radius-sm p-1 bg-surface border-[2px] border-outline text-on-surface hover:bg-primary/20"
              >
                <Archive className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => removeBoard(b)}
                aria-label="Удалить"
                className="rounded-radius-sm p-1 bg-surface border-[2px] border-outline text-on-surface hover:bg-error/20 hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="type-label-large text-on-surface-variant hover:text-on-surface"
          >
            {showArchived ? "Скрыть" : "Показать"} архивированные ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {archived.map((b) => (
                <div
                  key={b.id}
                  className="relative overflow-hidden rounded-radius-lg bg-surface border-[3px] border-outline shadow-level1 opacity-60"
                >
                  <div className="h-3 border-b-[3px] border-outline" style={{ backgroundColor: bgStyleColor(b.background) }} />
                  <Link href={`/board/${b.id}`} className="block p-4 min-h-[96px]">
                    <span className="type-title-medium text-on-surface">{b.title}</span>
                  </Link>
                  <div className="absolute right-2 top-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => archiveBoard(b, false)}
                      aria-label="Восстановить"
                      className="rounded-radius-sm p-1 bg-surface border-[2px] border-outline text-on-surface hover:bg-primary/20"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBoard(b)}
                      aria-label="Удалить"
                      className="rounded-radius-sm p-1 bg-surface border-[2px] border-outline text-on-surface hover:bg-error/20 hover:text-error"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Создать доску">
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Работа"
            autoFocus
          />
          <div>
            <p className="type-label-large text-on-surface-variant mb-2">Фон</p>
            <div className="flex flex-wrap gap-2">
              {BG_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setBg(o.key)}
                  aria-label={o.key}
                  className={`h-8 w-8 rounded-radius-sm ring-2 transition ${bg === o.key ? "ring-on-surface" : "ring-transparent"}`}
                  style={{ backgroundColor: o.color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setCreateOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreate} loading={isPending}>
              Создать
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editBoard} onClose={() => setEditBoard(null)} title="Редактировать доску">
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            autoFocus
          />
          <Input
            label="Описание"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
          <div>
            <p className="type-label-large text-on-surface-variant mb-2">Фон</p>
            <div className="flex flex-wrap gap-2">
              {BG_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setEditBg(o.key)}
                  aria-label={o.key}
                  className={`h-8 w-8 rounded-radius-sm border-[2px] border-outline transition ${editBg === o.key ? "ring-2 ring-on-surface" : "ring-transparent"}`}
                  style={{ backgroundColor: o.color }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setEditBoard(null)}>
              Отмена
            </Button>
            <Button onClick={saveEditBoard} loading={editPending}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmBoard}
        title="Удалить доску?"
        message="Доска и все её данные будут удалены навсегда."
        confirmLabel="Удалить"
        danger
        onConfirm={confirmRemoveBoard}
        onCancel={() => setConfirmBoard(null)}
      />
    </div>
  );
}
