"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Calendar, MessageSquare, Paperclip } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CardDTO } from "@/lib/actions/board";

function cardId(id: number) {
  return `card-${id}`;
}

interface TaskCardProps {
  card: CardDTO;
  onClick: () => void;
}

export function TaskCard({ card, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardId(card.id),
    data: { type: "card" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const due = card.dueDate ? new Date(card.dueDate) : null;
  const overdue = due ? due < new Date() : false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group cursor-pointer rounded-radius-md bg-surface border-[3px] border-outline p-2.5 shadow-level1 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-level2"
      suppressHydrationWarning
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={card.title}
    >
      {card.coverColor && (
        <div className="mb-2 h-2 rounded-radius-xs" style={{ backgroundColor: card.coverColor }} />
      )}
      {card.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span
              key={l.id}
              className="inline-block rounded-radius-xs px-1.5 py-0.5 type-label-medium text-white border-[1px] border-black/30"
              style={{ backgroundColor: l.color }}
              title={l.name || undefined}
            >
              {l.name || "•"}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-on-surface-variant opacity-0 group-hover:opacity-60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Переместить карточку"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          suppressHydrationWarning
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <p className="type-body-large text-on-surface font-medium break-words flex-1">
          {card.title}
        </p>
      </div>
      {card.description && (
        <p className="mt-1 type-body-medium text-on-surface/70 line-clamp-2 break-words">
          {card.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {due && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-radius-xs px-1.5 py-0.5 type-label-medium",
              overdue ? "bg-error-container text-on-error-container" : "bg-surface-container text-on-surface-variant",
            )}
          >
            <Calendar className="h-3 w-3" />
            {due.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
          </span>
        )}
        {card.memberIds.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-surface-container px-1.5 py-0.5 type-label-medium text-on-surface-variant">
            {card.memberIds.length} уч.
          </span>
        )}
        {card.commentCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-radius-xs px-1.5 py-0.5 type-label-medium bg-surface-container text-on-surface-variant">
            <MessageSquare className="h-3 w-3" /> {card.commentCount}
          </span>
        )}
        {card.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-radius-xs px-1.5 py-0.5 type-label-medium bg-surface-container text-on-surface-variant">
            <Paperclip className="h-3 w-3" /> {card.attachmentCount}
          </span>
        )}
      </div>
    </div>
  );
}
