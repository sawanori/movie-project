"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  Loader2,
  User,
  CreditCard,
  Bell,
  Shield,
  LogOut,
  ExternalLink,
  ChevronRight,
  Crown,
  Zap,
  Check,
} from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
  video_count_this_month: number;
  created_at: string;
}

interface UsageData {
  plan: string;
  used: number;
  limit: number;
  reset_date: string;
}

const planInfo: Record<string, { name: string; color: string; icon: React.ElementType }> = {
  free: { name: "無料トライアル", color: "bg-zinc-500", icon: User },
  starter: { name: "Starter", color: "bg-blue-500", icon: Zap },
  pro: { name: "Pro", color: "bg-purple-500", icon: Crown },
  business: { name: "Business", color: "bg-amber-500", icon: Crown },
};

export default function SettingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [profileRes, usageRes] = await Promise.all([
        authApi.getMe(),
        authApi.getUsage(),
      ]);
      setProfile(profileRes);
      setUsage(usageRes);
    } catch (error) {
      console.error("Failed to load settings data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!confirm("ログアウトしますか？")) return;

    setSigningOut(true);
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Failed to sign out:", error);
    } finally {
      setSigningOut(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  const currentPlan = planInfo[profile?.plan || "free"];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          アカウント設定
        </h1>

        {loading ? (
          <div className="mt-12 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {/* Profile Section */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <div className="flex items-center gap-4">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-16 w-16 rounded-full"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <User className="h-8 w-8 text-zinc-400" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                    {profile?.display_name || user.email?.split("@")[0]}
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {user.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription Section */}
            <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-white">
                <CreditCard className="h-5 w-5" />
                サブスクリプション
              </h2>

              <div className="mt-4 flex items-center justify-between rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-white",
                      currentPlan.color
                    )}
                  >
                    <currentPlan.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">
                      {currentPlan.name}プラン
                    </p>
                    {usage && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        今月 {usage.used}/{usage.limit} 本使用
                      </p>
                    )}
                  </div>
                </div>
                <Link href="/pricing">
                  <Button variant="outline" size="sm">
                    プランを変更
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {/* Usage Bar */}
              {usage && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      今月の使用量
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {Math.round((usage.used / usage.limit) * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-purple-500 transition-all"
                      style={{
                        width: `${Math.min(
                          (usage.used / usage.limit) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {usage.reset_date}にリセットされます
                  </p>
                </div>
              )}
            </div>

            {/* Settings Menu */}
            <div className="rounded-xl bg-white shadow-sm dark:bg-zinc-900">
              <SettingsMenuItem
                icon={Bell}
                title="通知設定"
                description="メール通知の設定を管理"
                href="/settings/notifications"
              />
              <SettingsMenuItem
                icon={Shield}
                title="セキュリティ"
                description="パスワードと2要素認証"
                href="/settings/security"
              />
              <SettingsMenuItem
                icon={CreditCard}
                title="請求・支払い"
                description="支払い方法と請求履歴"
                href="/settings/billing"
                external
              />
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-zinc-900">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-red-600 dark:text-red-400">
                <Shield className="h-5 w-5" />
                危険な操作
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                これらの操作は元に戻せません。十分にご注意ください。
              </p>
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {signingOut ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  ログアウト
                </Button>
              </div>
            </div>

            {/* Account Info */}
            <div className="rounded-xl bg-zinc-100 p-4 text-center dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">
                アカウント作成日:{" "}
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("ja-JP")
                  : "-"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                アカウントID: {profile?.id?.slice(0, 8)}...
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SettingsMenuItem({
  icon: Icon,
  title,
  description,
  href,
  external,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-center justify-between border-b border-zinc-100 p-4 last:border-0 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        </div>
        <div>
          <p className="font-medium text-zinc-900 dark:text-white">{title}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        </div>
      </div>
      {external ? (
        <ExternalLink className="h-5 w-5 text-zinc-400" />
      ) : (
        <ChevronRight className="h-5 w-5 text-zinc-400" />
      )}
    </div>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className="block transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
    >
      {content}
    </Link>
  );
}
