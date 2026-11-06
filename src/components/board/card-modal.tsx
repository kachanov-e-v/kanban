"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  X, Tag, CheckSquare, MessageSquare, Paperclip, Plus, Trash2, Archive, Pencil,
} from "lucide-react";
import {
  getCardDetail,
  addLabelToCard,
  removeLabelFromCard,
  addMemberToCard,
  removeMemberFromCard,
  createChecklist,
  deleteChecklist,
  createChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  addComment,
  deleteComment,
  addAttachment,
  deleteAttachment,
} from "@/lib/actions/card";
import { updateCard, archiveCard, deleteCard } from "@/lib/actions/board";
import { createLabel, deleteLabel, updateLabel } from "@/lib/actions/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BoardDetailDTO } from "@/lib/actions/board";

interface CardModalProps {
  cardId: number;
  boardId: number;
  members: BoardDetailDTO["members"];
  onClose: () => void;
  onMutate: () => void;
}

type Detail = Awaited<ReturnType<typeof getCardDetail>>;

export function CardModal({ cardId, boardId, members, onClose, onMutate }: CardModalProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "checklist" | "comments" | "attachments">("overview");

  // edit fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [coverColor, setCoverColor] = useState("");

  // new items
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newItemText, setNewItemText] = useState<Record<number, string>>({});
  const [newComment, setNewComment] = useState("");
  const [newAttachmentName, setNewAttachmentName] = useState("");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#0079bf");
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editingLabelName, setEditingLabelName] = useState("");
  const [editingLabelColor, setEditingLabelColor] = useState("#0079bf");

  async function load(silent = false) {
    if (!silent && !detail) setLoading(true);
    try {
      const d = await getCardDetail(cardId);
      setDetail(d);
      setTitle(d.card.title);
      setDescription(d.card.description);
      setDueDate(d.card.dueDate ? d.card.dueDate.slice(0, 10) : "");
      setCoverColor(d.card.coverColor ?? "");
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent && !detail) setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    load(true);
    onMutate();
    router.refresh();
  }

  function saveOverview() {
    startTransition(async () => {
      try {
        await updateCard(cardId, {
          title: title.trim() || detail!.card.title,
          description,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          coverColor: coverColor || null,
        });
        await load(true);
        onMutate();
      } catch (e) {
        console.error(e);
      }
    });
  }

  const initialRef = useRef(true);
  useEffect(() => {
    if (!detail) return;
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      saveOverview();
    }, 500);
    return () => clearTimeout(t);
  }, [title, description, dueDate, coverColor]); // eslint-disable-line react-hooks/exhaustive-deps
    if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="rounded-radius-lg bg-surface border border-outline p-6 shadow-level4">Загрузка...</div>
      </div>
    );
  }

  const cardLabels = detail.labels.map((l) => l.id);
  const cardMembers = detail.members.map((m) => m.id);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-radius-lg bg-surface border border-outline my-8 shadow-level4">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-outline">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="type-title-large text-on-surface bg-transparent border-none focus:outline-none focus:ring-0 w-full font-bold"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-full p-2 text-on-surface-variant hover:bg-primary/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-3">
          {[
            { key: "overview", label: "Обзор", icon: Tag },
            { key: "checklist", label: "Чек-листы", icon: CheckSquare },
            { key: "comments", label: "Комментарии", icon: MessageSquare },
            { key: "attachments", label: "Вложения", icon: Paperclip },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key as "overview" | "checklist" | "comments" | "attachments")}
                className={`flex items-center gap-1.5 rounded-radius-sm px-3 py-1.5 type-label-large ${
                  tab === t.key
                    ? "bg-primary-container text-on-primary-container"
                    : "text-on-surface-variant hover:bg-primary/20"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="px-6 py-4 flex flex-col gap-5">
          {tab === "overview" && (
            <>
              <div>
                <label className="type-label-large text-on-surface-variant mb-1 block">Описание</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Добавить более подробное описание..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="type-label-large text-on-surface-variant mb-1 block">Срок</label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="type-label-large text-on-surface-variant mb-1 block">Цвет обложки</label>
                  <div className="flex gap-2">
                    {["", "#61bd4f", "#f2d600", "#ff9f1a", "#eb5a46", "#c377e0", "#0079bf"].map((c) => (
                      <button
                        key={c || "none"}
                        type="button"
                        onClick={() => {
                          setCoverColor(c);
                          startTransition(async () => {
                            await updateCard(cardId, { coverColor: c || null });
                            setDetail((prev) =>
                              prev ? { ...prev, card: { ...prev.card, coverColor: c || null } } : prev,
                            );
                            onMutate();
                          });
                        }}
                        className={`h-7 w-7 rounded-radius-sm border-2 ${coverColor === c ? "border-on-surface" : "border-transparent"}`}
                        style={{ backgroundColor: c || "#e0e0e0" }}
                        aria-label={c || "без цвета"}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="type-label-large text-on-surface/70">Метки</label>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {detail.labels.map((l) => {
                    const active = cardLabels.includes(l.id);
                    if (editingLabelId === l.id) {
                      return (
                        <div key={l.id} className="flex items-center gap-2">
                          <Input value={editingLabelName} onChange={(e) => setEditingLabelName(e.target.value)} className="w-32" />
                          <input type="color" value={editingLabelColor} onChange={(e) => setEditingLabelColor(e.target.value)} className="h-8 w-10 rounded-radius-sm border border-outline" />
                          <Button size="sm" onClick={() => { startTransition(async () => { await updateLabel(l.id, { name: editingLabelName.trim(), color: editingLabelColor }); setEditingLabelId(null); refresh(); }); }}>OK</Button>
                          <Button size="sm" variant="text" onClick={() => setEditingLabelId(null)}>X</Button>
                        </div>
                      );
                    }
                    return (
                      <div key={l.id} className="flex items-center gap-1">
                        <button
                        type="button"
                        onClick={() => {
                          startTransition(async () => {
                            if (active) await removeLabelFromCard(cardId, l.id);
                            else await addLabelToCard(cardId, l.id);
                            refresh();
                          });
                        }}
                        className={`rounded-full px-3 py-1 type-label-medium text-white transition ${active ? "ring-2 ring-on-surface" : "opacity-60"}`}
                        style={{ backgroundColor: l.color }}
                      >                        {l.name || "•"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLabelId(l.id);
                          setEditingLabelName(l.name);
                          setEditingLabelColor(l.color);
                        }}
                        className="rounded-full p-1 text-on-surface-variant hover:text-primary"
                        aria-label="Редактировать метку"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingConfirm({
                            message: `Удалить метку "${l.name || "без названия"}"?`,
                            onConfirm: () => {
                              startTransition(async () => {
                                await deleteLabel(l.id);
                                refresh();
                              });
                            },
                          });
                        }}
                        className="rounded-full p-1 text-on-surface-variant hover:text-error"
                        aria-label="Удалить метку"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Новая метка"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                  />
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    className="h-10 w-12 rounded-radius-sm border border-outline"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newLabelName.trim()) return;
                      startTransition(async () => {
                        await createLabel(boardId, newLabelName.trim(), newLabelColor);
                        setNewLabelName("");
                        refresh();
                      });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="type-label-large text-on-surface-variant mb-2 block">Участники</label>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const active = cardMembers.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          startTransition(async () => {
                            if (active) await removeMemberFromCard(cardId, m.id);
                            else await addMemberToCard(cardId, m.id);
                            refresh();
                          });
                        }}
                        className={`rounded-full px-3 py-1 type-label-medium transition ${
                          active
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container text-on-surface-variant"
                        }`}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "checklist" && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Название чек-листа"
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newChecklistTitle.trim()) return;
                    startTransition(async () => {
                      await createChecklist(cardId, newChecklistTitle.trim());
                      setNewChecklistTitle("");
                      refresh();
                    });
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {detail.checklists.map((cl) => {
                const done = cl.items.filter((i) => i.is_checked).length;
                const total = cl.items.length;
                return (
                  <div key={cl.id} className="rounded-radius-md bg-surface-container p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="type-title-medium text-on-surface">{cl.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="type-label-medium text-on-surface-variant">
                          {done}/{total}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingConfirm({
                              message: "Удалить чек-лист?",
                              onConfirm: () => {
                                startTransition(async () => {
                                  await deleteChecklist(cl.id);
                                  refresh();
                                });
                              },
                            });
                          }}
                          className="rounded p-1 text-on-surface-variant hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="h-1.5 rounded-full bg-surface-container-highest mb-2">
                        <div
                          className="h-1.5 rounded-full bg-primary transition-all"
                          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {cl.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!item.is_checked}
                            onChange={(e) => {
                              startTransition(async () => {
                                await toggleChecklistItem(item.id, e.target.checked);
                                refresh();
                              });
                            }}
                            className="h-4 w-4 rounded"
                          />
                          <span
                            className={`type-body-medium flex-1 ${
                              item.is_checked ? "line-through text-on-surface-variant" : "text-on-surface"
                            }`}
                          >
                            {item.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingConfirm({
                                message: "Удалить пункт?",
                                onConfirm: () => {
                                  startTransition(async () => {
                                    await deleteChecklistItem(item.id);
                                    refresh();
                                  });
                                },
                              });
                            }}
                            className="rounded p-1 text-on-surface-variant hover:text-error"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="Добавить пункт"
                        value={newItemText[cl.id] ?? ""}
                        onChange={(e) =>
                          setNewItemText((prev) => ({ ...prev, [cl.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const t = (newItemText[cl.id] ?? "").trim();
                            if (!t) return;
                            startTransition(async () => {
                              await createChecklistItem(cl.id, t);
                              setNewItemText((prev) => ({ ...prev, [cl.id]: "" }));
                              refresh();
                            });
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const t = (newItemText[cl.id] ?? "").trim();
                          if (!t) return;
                          startTransition(async () => {
                            await createChecklistItem(cl.id, t);
                            setNewItemText((prev) => ({ ...prev, [cl.id]: "" }));
                            refresh();
                          });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {detail.checklists.length === 0 && (
                <p className="type-body-medium text-on-surface-variant">Чек-листов пока нет</p>
              )}
            </div>
          )}

          {tab === "comments" && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Textarea
                  className="w-full"
                  placeholder="Написать комментарий..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newComment.trim()) return;
                    startTransition(async () => {
                      await addComment(cardId, newComment.trim());
                      setNewComment("");
                      refresh();
                    });
                  }}
                  loading={isPending}
                >
                  Отправить
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {detail.comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container type-label-large">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="type-label-large text-on-surface">{c.name}</span>
                        <span className="type-label-medium text-on-surface-variant">
                          {new Date(c.created_at).toLocaleString("ru-RU")}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingConfirm({
                              message: "Удалить комментарий?",
                              onConfirm: () => {
                                startTransition(async () => {
                                  await deleteComment(c.id);
                                  refresh();
                                });
                              },
                            });
                          }}
                          className="ml-auto rounded p-1 text-on-surface-variant hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="type-body-medium text-on-surface mt-1 whitespace-pre-wrap">{c.text}</p>
                    </div>
                  </div>
                ))}
                {detail.comments.length === 0 && (
                  <p className="type-body-medium text-on-surface-variant">Комментариев пока нет</p>
                )}
              </div>
            </div>
          )}

          {tab === "attachments" && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Название"
                  value={newAttachmentName}
                  onChange={(e) => setNewAttachmentName(e.target.value)}
                />
                <Input
                  placeholder="https://..."
                  value={newAttachmentUrl}
                  onChange={(e) => setNewAttachmentUrl(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newAttachmentName.trim() || !newAttachmentUrl.trim()) return;
                    startTransition(async () => {
                      await addAttachment(cardId, newAttachmentName.trim(), newAttachmentUrl.trim());
                      setNewAttachmentName("");
                      setNewAttachmentUrl("");
                      refresh();
                    });
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {detail.attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-radius-md bg-surface-container p-3"
                  >
                    <Paperclip className="h-4 w-4 text-on-surface-variant" />
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="type-body-medium text-primary hover:underline flex-1 truncate"
                    >
                      {a.name}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingConfirm({
                          message: "Удалить вложение?",
                          onConfirm: () => {
                            startTransition(async () => {
                              await deleteAttachment(a.id);
                              refresh();
                            });
                          },
                        });
                      }}
                      className="rounded p-1 text-on-surface-variant hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {detail.attachments.length === 0 && (
                  <p className="type-body-medium text-on-surface-variant">Вложений пока нет</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-outline flex justify-between items-center">
          <div className="flex gap-2">
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                startTransition(async () => {
                  await archiveCard(cardId, !detail.card.isArchived);
                  onClose();
                  onMutate();
                  router.refresh();
                });
              }}
            >
              <Archive className="h-4 w-4" /> {detail.card.isArchived ? "Восстановить" : "Архивировать"}
            </Button>
            <Button
              variant="text"
              size="sm"
              className="text-error"
              onClick={() => {
                setPendingConfirm({
                  message: "Удалить карточку навсегда?",
                  onConfirm: () => {
                    startTransition(async () => {
                      await deleteCard(cardId);
                      onClose();
                      onMutate();
                      router.refresh();
                    });
                  },
                });
              }}
            >
              <Trash2 className="h-4 w-4" /> Удалить
            </Button>
          </div>
          <Button variant="text" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingConfirm}
        title="Подтверждение"
        message={pendingConfirm?.message ?? ""}
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          pendingConfirm?.onConfirm();
          setPendingConfirm(null);
        }}
        onCancel={() => setPendingConfirm(null)}
      />
      </div>
  );
}