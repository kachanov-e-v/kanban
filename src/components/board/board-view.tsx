"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Plus, Search, Filter, Archive } from "lucide-react";
import { createList, moveList, moveCard, archiveCard, getArchivedCards } from "@/lib/actions/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ListColumn } from "./list-column";
import { CardModal } from "./card-modal";
import { ChatPanel } from "./chat-panel";
import type { BoardDetailDTO, ListDTO, CardDTO } from "@/lib/actions/board";

function listId(id: number) {
  return `list-${id}`;
}

export function BoardView({ initial }: { initial: BoardDetailDTO }) {
  const router = useRouter();
  const [data, setData] = useState<BoardDetailDTO>(initial);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivedCards, setArchivedCards] = useState<Awaited<ReturnType<typeof getArchivedCards>>>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLabelIds, setFilterLabelIds] = useState<number[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [dragCard, setDragCard] = useState<CardDTO | null>(null);
  const [dragList, setDragList] = useState<ListDTO | null>(null);
  const [isPending, startTransition] = useTransition();
  const [prevInitial, setPrevInitial] = useState<BoardDetailDTO>(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setData(initial);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filteredLists = useMemo(() => {
    return data.lists
      .filter((l) => !l.isArchived)
      .map((l) => ({
        ...l,
        cards: l.cards.filter((card) => {
          if (search.trim()) {
            const q = search.toLowerCase();
            if (!card.title.toLowerCase().includes(q) && !card.description.toLowerCase().includes(q)) return false;
          }
          if (filterLabelIds.length) {
            if (!filterLabelIds.every((id) => card.labels.some((lab) => lab.id === id))) return false;
          }
          return true;
        }),
      }));
  }, [data.lists, search, filterLabelIds]);

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("list-")) {
      const lid = Number(id.replace("list-", ""));
      const l = data.lists.find((x) => x.id === lid);
      if (l) setDragList(l);
      return;
    }
    if (id.startsWith("card-")) {
      const cid = Number(id.replace("card-", ""));
      for (const l of data.lists) {
        const c = l.cards.find((x) => x.id === cid);
        if (c) {
          setDragCard(c);
          break;
        }
      }
    }
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId.startsWith("card-")) return;

    const activeCardIdNum = Number(activeId.replace("card-", ""));
    let targetListId: number | null = null;
    if (overId.startsWith("list-")) targetListId = Number(overId.replace("list-", ""));
    else if (overId.startsWith("card-")) {
      const overCardId = Number(overId.replace("card-", ""));
      const l = data.lists.find((x) => x.cards.some((c) => c.id === overCardId));
      targetListId = l?.id ?? null;
    }
    if (targetListId === null) return;

    setData((prev) => {
      const activeList = prev.lists.find((l) => l.cards.some((c) => c.id === activeCardIdNum));
      if (!activeList) return prev;
      if (activeList.id === targetListId) {
        const oldIndex = activeList.cards.findIndex((c) => c.id === activeCardIdNum);
        const newIndex = overId.startsWith("card-")
          ? activeList.cards.findIndex((c) => c.id === Number(overId.replace("card-", "")))
          : activeList.cards.length - 1;
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
        const newCards = arrayMove(activeList.cards, oldIndex, newIndex);
        return {
          ...prev,
          lists: prev.lists.map((l) => (l.id === activeList.id ? { ...l, cards: newCards } : l)),
        };
      }
      const card = activeList.cards.find((c) => c.id === activeCardIdNum);
      if (!card) return prev;
      const targetList = prev.lists.find((l) => l.id === targetListId);
      if (!targetList) return prev;
      const newActiveCards = activeList.cards.filter((c) => c.id !== activeCardIdNum);
      let insertIndex = targetList.cards.length;
      if (overId.startsWith("card-")) {
        const idx = targetList.cards.findIndex((c) => c.id === Number(overId.replace("card-", "")));
        if (idx !== -1) insertIndex = idx;
      }
      const newTargetCards = [...targetList.cards];
      newTargetCards.splice(insertIndex, 0, { ...card, listId: targetListId });
      return {
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id === activeList.id) return { ...l, cards: newActiveCards };
          if (l.id === targetListId) return { ...l, cards: newTargetCards };
          return l;
        }),
      };
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setDragCard(null);
    setDragList(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("list-")) {
      const activeListIdNum = Number(activeId.replace("list-", ""));
      const overListIdNum = Number(overId.replace("list-", ""));
      if (activeListIdNum === overListIdNum) return;
      const oldIndex = data.lists.findIndex((l) => l.id === activeListIdNum);
      const newIndex = data.lists.findIndex((l) => l.id === overListIdNum);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(data.lists, oldIndex, newIndex);
      setData((prev) => ({ ...prev, lists: reordered }));
      startTransition(async () => {
        try {
          await moveList(activeListIdNum, newIndex);
        } catch (err) {
          console.error(err);
        }
        router.refresh();
      });
      return;
    }

    if (activeId.startsWith("card-")) {
      const cid = Number(activeId.replace("card-", ""));
      const currentList = data.lists.find((l) => l.cards.some((c) => c.id === cid));
      if (!currentList) return;
      const idx = currentList.cards.findIndex((c) => c.id === cid);
      startTransition(async () => {
        try {
          await moveCard(cid, currentList.id, idx === -1 ? 0 : idx);
        } catch (err) {
          console.error(err);
        }
        router.refresh();
      });
    }
  }

  async function openArchive() {
    setArchiveOpen(true);
    setArchiveLoading(true);
    try {
      const cards = await getArchivedCards(data.board.id);
      setArchivedCards(cards);
    } catch (e) {
      console.error(e);
    } finally {
      setArchiveLoading(false);
    }
  }

  function restoreCard(id: number) {
    startTransition(async () => {
      try {
        await archiveCard(id, false);
        setArchivedCards((prev) => prev.filter((x) => x.card.id !== id));
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    });
  }
  async function handleCreateList() {
    const t = newListTitle.trim();
    if (!t) return;
    startTransition(async () => {
      try {
        await createList(data.board.id, t);
        setNewListTitle("");
        setNewListOpen(false);
        router.refresh();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function bgStyle(bg: string) {
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
    return { backgroundColor: map[bg] ?? "#0079bf" };
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={bgStyle(data.board.background)}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 bg-surface border-b-[3px] border-outline">
        <h1 className="type-title-large text-on-surface truncate">{data.board.title}</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="h-8 w-40 sm:w-56 rounded-radius-sm bg-surface border-[3px] border-outline px-8 pr-2 type-body-medium text-on-surface placeholder:text-on-surface/50 focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={openArchive}
            className="rounded-radius-sm p-1.5 bg-surface/80 border-[2px] border-outline text-on-surface hover:bg-primary/20"
            aria-label="Архив"
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowFilter((v) => !v)}
            className="rounded-radius-sm p-1.5 bg-surface border-[2px] border-outline text-on-surface hover:bg-primary/20"
            aria-label="Фильтр"
          >
            <Filter className="h-4 w-4" />
          </button>
          <Button size="sm" variant="tonal" onClick={() => setNewListOpen(true)}>
            <Plus className="h-4 w-4" /> Список
          </Button>
        </div>
      </div>

      {showFilter && (
        <div className="px-4 py-2 bg-surface border-b-[3px] border-outline flex flex-wrap gap-2">
          {data.labels.map((l) => {
            const active = filterLabelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() =>
                  setFilterLabelIds((prev) =>
                    active ? prev.filter((x) => x !== l.id) : [...prev, l.id],
                  )
                }
                className={`rounded-full px-3 py-1 type-label-medium text-white border-[2px] border-outline ${
                  active ? "ring-2 ring-outline" : "opacity-80"
                }`}
                style={{ backgroundColor: l.color }}
              >
                {l.name || "•"}
              </button>
            );
          })}
          {filterLabelIds.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterLabelIds([])}
              className="type-label-medium text-on-surface underline font-bold"
            >
              Сбросить
            </button>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-2">
          <SortableContext
            items={filteredLists.map((l) => listId(l.id))}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex h-full min-w-max gap-3">
              {filteredLists.map((list) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  onMutate={() => router.refresh()}
                  onCardClick={(id) => setActiveCardId(id)}
                />
              ))}
            </div>
          </SortableContext>
        </div>

        <DragOverlay>
          {dragCard ? (
            <div className="w-64 rotate-2 opacity-90">
              <div className="rounded-radius-md bg-surface border-[3px] border-outline p-3 shadow-level3">
                <p className="type-body-large text-on-surface font-bold">{dragCard.title}</p>
              </div>
            </div>
          ) : dragList ? (
            <div className="w-72 rotate-1 opacity-90 rounded-radius-lg bg-surface border-[3px] border-outline p-3 shadow-level3">
              <p className="type-title-medium text-on-surface">{dragList.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Modal open={newListOpen} onClose={() => setNewListOpen(false)} title="Новый список">
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
            placeholder="Например: Backlog"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="text" onClick={() => setNewListOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreateList} loading={isPending}>
              Создать
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={archiveOpen} onClose={() => setArchiveOpen(false)} title="Архив карточек">
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          {archiveLoading && <p className="type-body-medium text-on-surface/60">Загрузка...</p>}
          {!archiveLoading && archivedCards.length === 0 && (
            <p className="type-body-medium text-on-surface/60">Архив пуст</p>
          )}
          {archivedCards.map((a) => (
            <div key={a.card.id} className="flex items-center justify-between gap-3 rounded-radius-md bg-surface border-[2px] border-outline p-3">
              <div className="min-w-0">
                <p className="type-body-large text-on-surface font-bold truncate">{a.card.title}</p>
                <p className="type-label-medium text-on-surface/60">{a.listTitle}</p>
              </div>
              <Button size="sm" variant="outlined" onClick={() => restoreCard(a.card.id)}>
                Восстановить
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      {activeCardId !== null && (
        <CardModal
          cardId={activeCardId}
          boardId={data.board.id}
          members={data.members}
          onClose={() => setActiveCardId(null)}
          onMutate={() => router.refresh()}
        />
      )}
      <ChatPanel boardId={data.board.id} />
    </div>
  );
}
