import { notFound } from "next/navigation";
import { getBoard } from "@/lib/actions/board";
import { BoardView } from "@/components/board/board-view";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const boardId = Number(id);
  if (Number.isNaN(boardId)) notFound();
  const data = await getBoard(boardId);
  if (!data) notFound();
  return <BoardView initial={data} />;
}