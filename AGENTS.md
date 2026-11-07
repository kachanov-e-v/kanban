<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Project notes

- Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Prisma ORM.
- DB: SQLite locally (`DATABASE_URL=file:../data/kanban.db`), Turso in production (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`).
- Auth: JWT in httpOnly cookie, bcryptjs.
- AI chat: per-board, isolated; tools in `src/lib/actions/chat.ts`.
- Run: `npm run dev` → http://localhost:3000. Build: `npm run build`.
- Tests: none yet (see ROADMAP.md).