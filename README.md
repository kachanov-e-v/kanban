# Trello-like Kanban Board (Next.js + Material 3)

Полнофункциональный аналог Trello: доски, списки, карточки, метки, сроки, чек-листы, комментарии, вложения, архив, drag-and-drop.

## Возможности

- Регистрация/вход/выход, защита маршрутов.
- Множественные доски с фонами, избранное, архив, удаление.
- Списки (колонки): создание, переименование, архивирование, удаление, drag-and-drop.
- Карточки: создание, редактирование названия/описания, срок, цвет обложки, метки, участники, чек-листы с прогрессом, комментарии, вложения (URL), архив.
- Поиск и фильтрация по меткам.
- Material 3 токены, адаптивность, доступность.

## Запуск

```bash
npm install
npm run dev
```

http://localhost:3000

Production:

```bash
npm run build
npm start
```

## Переменные окружения

- `AUTH_SECRET` — секрет JWT (≥32 символов)
- `DATABASE_PATH` — путь к SQLite (по умолчанию `./data/kanban.db`)

## Структура

```
src/app/(app)/boards          # список досок
src/app/(app)/board/[id]      # доска
src/components/board          # boards-view, board-view, list-column, task-card, card-modal
src/lib/actions/board.ts      # доски, списки, карточки, перемещение
src/lib/actions/card.ts       # метки, участники, чек-листы, комментарии, вложения
src/lib/db.ts                 # схема SQLite
```