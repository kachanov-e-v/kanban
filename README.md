# Trello-like Kanban Board (Next.js + Material 3 + AI Chat)

Полнофункциональный аналог Trello: доски, списки, карточки, метки, сроки, чек-листы, комментарии, вложения, архив, drag-and-drop, а также встроенный ИИ-чат в каждой доске.

## Возможности

- Регистрация / вход / выход, защита маршрутов (JWT-сессии).
- Множественные доски с фонами, избранное, архив, удаление.
- Списки (колонки): создание, переименование, архивирование, удаление, drag-and-drop.
- Карточки: создание, редактирование названия/описания/сроков/цвета обложки, метки, участники, чек-листы с прогрессом, комментарии, вложения (URL), архив.
- Поиск и фильтрация по меткам.
- **ИИ-чат в каждой доске**: вопросы (в т.ч. про погоду), управление доской (создание списков/карточек, метки, комментарии, чек-листы, вложения, участники), веб-поиск. Чат изолирован по доскам.
- **Личный кабинет**: редактирование профиля и настройка AI API (провайдеры Kilo / OpenRouter / свой, выбор бесплатных моделей).
- Material 3 токены, адаптивность, доступность.

## Стек

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4, Material 3 design tokens
- Prisma ORM (SQLite локально / Turso в production)
- bcryptjs, jose (JWT), zod

## Запуск локально

```bash
npm install
cp .env.example .env.local
# заполните AUTH_SECRET (>=32 символов)
npm run dev
```

Откройте http://localhost:3000

## Переменные окружения

| Переменная | Описание |
|---|---|
| `AUTH_SECRET` | Секрет JWT (≥32 символов) — обязателен |
| `DATABASE_URL` | `file:../data/kanban.db` (SQLite локально) |
| `TURSO_DATABASE_URL` | URL Turso БД (production) |
| `TURSO_AUTH_TOKEN` | Токен Turso (production) |

## База данных

Схема описана в `prisma/schema.prisma`. Локально:

```bash
npx prisma db push
```

Для Turso: примените `turso_schema.sql` к вашей БД (через Turso CLI или веб-консоль).

## Структура

```
src/app/(app)/boards          # список досок
src/app/(app)/board/[id]      # доска
src/app/(app)/profile         # личный кабинет
src/components/board          # boards-view, board-view, list-column, task-card, card-modal, chat-panel
src/components/profile        # profile-view
src/lib/actions/board.ts      # доски, списки, карточки, перемещение
src/lib/actions/card.ts       # метки, участники, чек-листы, комментарии, вложения
src/lib/actions/chat.ts       # ИИ-чат, инструменты
src/lib/actions/profile.ts    # профиль и AI API
src/lib/prisma.ts             # Prisma client (SQLite / Turso)
prisma/schema.prisma          # схема БД
turso_schema.sql              # SQL для инициализации Turso
```

## Деплой на Vercel

1. Подключите репозиторий к Vercel.
2. Добавьте переменные: `AUTH_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
3. В Turso примените `turso_schema.sql`.
4. `npm run build` (Vercel выполнит автоматически).

## AI-чат

- По умолчанию используется провайдер **Kilo** (бесплатные модели).
- В личном кабинете можно выбрать OpenRouter или свой endpoint.
- Инструменты: погода, создание/обновление карточек, метки, комментарии, чек-листы, вложения, участники, веб-поиск.
- Чат изолирован по доскам: нет доступа к другим доскам.