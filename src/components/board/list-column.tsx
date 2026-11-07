"use client";

import { useState, useTransition } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, Plus, Pencil, Archive, Trash2 } from "lucide-react";
import { updateList, deleteList, archiveList, createCard } from "@/lib/actions/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { TaskCard } from "./task-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ListDTO } from "@/lib/actions/board";

function listId(id: number) {
  return `list-${id}`;
}
function cardId(id: number) {
  return `card-${id}`;
}

interface ListColumnProps {
  list: ListDTO;
  onMutate: () => void;
  onCardClick: (id: number) => void;
}

export function ListColumn({ list, onMutate, onCardClick }: ListColumnProps) {
  const [isPending, startTransition] = useTransition();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: listId(list.id), data: { type: "list" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(list.title);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function handleSaveTitle() {
    const t = editTitle.trim();
    if (!t || t === list.title) {
      setEditOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateList(list.id, t);
        onMutate();
      } catch (e) {
        console.error(e);
      } finally {
        setEditOpen(false);
      }
    });
  }

  function handleDelete() {
    setConfirmOpen(true);
  }

  function confirmDelete() {
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        await deleteList(list.id);
        onMutate();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function handleArchive() {
    startTransition(async () => {
      try {
        await archiveList(list.id, true);
        onMutate();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function handleAddCard() {
    const t = newTitle.trim();
    if (!t) return;
    startTransition(async () => {
      try {
        await createCard(list.id, t);
        setNewTitle("");
        setAddOpen(false);
        onMutate();
      } catch (e) {
        console.error(e);
      }
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-72 shrink-0 flex-col rounded-radius-lg bg-surface border-[3px] border-outline shadow-level1 transition-all h-full overflow-hidden"
      suppressHydrationWarning
      role="region"
      aria-labelledby={`list-title-${list.id}`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-on-surface-variant hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Переместить список"
          {...attributes}
          {...listeners}
          suppressHydrationWarning
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 id={`list-title-${list.id}`} className="type-title-medium text-on-surface flex-1 break-words">
          {list.title}
        </h3>
        <span className="type-label-medium text-on-surface rounded-radius-sm bg-primary-container px-2 py-0.5 border-[2px] border-outline">
          {list.cards.length}
        </span>
        <button
          type="button"
          onClick={() => {
            setEditTitle(list.title);
            setEditOpen(true);
          }}
          aria-label="Редактировать список"
          className="rounded p-1 text-on-surface-variant hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleArchive}
          aria-label="Архивировать список"
          className="rounded p-1 text-on-surface-variant hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Удалить список"
          className="rounded p-1 text-on-surface-variant hover:text-error hover:bg-error/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={list.cards.map((c) => cardId(c.id))} strategy={verticalListSortingStrategy}>
          {list.cards.map((card) => (
            <TaskCard key={card.id} card={card} onClick={() => onCardClick(card.id)} />
          ))}
        </SortableContext>
        {list.cards.length === 0 && (
          <div className="flex items-center justify-center rounded-radius-md border-[3px] border-dashed border-outline py-6 text-on-surface/60 type-body-medium font-bold">
            Перетащите карточку сюда
          </div>
        )}
      </div>

      <div className="px-2 pb-2">
        <Button variant="text" size="sm" className="w-full justify-start" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Добавить карточку
        </Button>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать список">
        <div className="flex flex-col gap-4">
          <Input label="Название" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setEditOpen(false)}>Отмена</Button>
            <Button onClick={handleSaveTitle} loading={isPending}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Новая карточка">
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Ввести название карточки..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCard();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setAddOpen(false)}>Отмена</Button>
            <Button onClick={handleAddCard} loading={isPending}>Добавить</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmOpen}
        title="Удалить список?"
        message="Список и все его карточки будут удалены навсегда."
        confirmLabel="Удалить"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

    </div>
  );
}