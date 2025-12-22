"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Video, Settings, User } from "lucide-react";

export function Header() {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Video className="h-6 w-6 text-zinc-900 dark:text-white" />
            <span className="text-lg font-semibold text-zinc-900 dark:text-white">
              Movie Maker
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/pricing"
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              料金
            </Link>
          </nav>
        </div>

        <nav className="flex items-center gap-4">
          {loading ? (
            <div className="h-10 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          ) : user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  ダッシュボード
                </Button>
              </Link>
              <Link href="/generate">
                <Button size="sm">動画を作成</Button>
              </Link>
              <Link
                href="/settings"
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Settings className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/pricing" className="hidden md:block">
                <Button variant="ghost" size="sm">
                  料金
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm">
                  ログイン
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm">無料で始める</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
