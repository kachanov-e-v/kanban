import { getBoards, getArchivedBoards } from "@/lib/actions/board";
import { BoardsView } from "@/components/board/boards-view";

export default async function BoardsPage() {
  const boards = await getBoards();
  const archived = await getArchivedBoards();
  return <BoardsView initialBoards={boards} initialArchived={archived} />;
}
