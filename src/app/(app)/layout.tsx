import Link from "next/link";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 bg-surface border-b-[3px] border-outline px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/boards" className="type-title-large text-on-surface">
            Trello Clone
          </Link>
          <nav className="hidden sm:flex items-center gap-2">
            <Link
              href="/boards"
              className="type-label-large text-on-surface hover:bg-primary/20 px-2 py-1 rounded-radius-sm border-[2px] border-transparent hover:border-outline"
            >
              Доски
            </Link>
            <Link
              href="/profile"
              className="type-label-large text-on-surface hover:bg-primary/20 px-2 py-1 rounded-radius-sm border-[2px] border-transparent hover:border-outline"
            >
              Кабинет
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {session && (
            <span className="type-body-medium text-on-surface hidden sm:inline font-bold">
              {session.name}
            </span>
          )}
          <form action={logoutAction}>
            <Button variant="outlined" size="sm" type="submit" className="bg-surface">
              Выйти
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
