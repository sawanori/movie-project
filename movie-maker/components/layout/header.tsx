"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Video, Settings } from "lucide-react";

export function Header() {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#404040] bg-[#212121]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-12">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#fce300] flex items-center justify-center">
              <Video className="h-4 w-4 text-[#212121]" />
            </div>
            <span className="text-base font-semibold text-white">
              名もなき映像ジェネレーター
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link
              href="/pricing"
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:bg-[#333333] hover:text-white transition-colors"
            >
              料金
            </Link>
          </nav>
        </div>

        <nav className="flex items-center gap-3">
          {loading ? (
            <div className="h-10 w-24 animate-pulse rounded-lg bg-[#333333]" />
          ) : user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-[#333333]">
                  ダッシュボード
                </Button>
              </Link>
              <Link href="/generate">
                <Button size="sm" className="bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0">
                  動画を作成
                </Button>
              </Link>
              <Link
                href="/settings"
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#333333] transition-colors"
              >
                <Settings className="h-5 w-5 text-gray-400" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/pricing" className="hidden md:block">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white hover:bg-[#333333]">
                  料金
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="sm" className="border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white">
                  ログイン
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm" className="bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold border-0">
                  無料で始める
                </Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
