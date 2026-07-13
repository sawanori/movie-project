import Link from "next/link";
import type { Usage } from "@/lib/hooks/use-dashboard-data";

const PLAN_LABELS: Record<string, string> = {
  free: "無料トライアル",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

function planLabel(plan: string): string {
  return PLAN_LABELS[plan] || plan;
}

function usagePercent(used: number, limit: number): number {
  if (!limit || limit <= 0) return 0;
  return Math.min((used / limit) * 100, 100);
}

interface UsageCardProps {
  usage: Usage;
}

export function UsageCard({ usage }: UsageCardProps) {
  const percent = usagePercent(usage.videos_used, usage.videos_limit);

  return (
    <div className="mt-8 rounded-xl bg-[#2a2a2a] border border-[#404040] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">
            今月の使用状況
          </p>
          <p className="mt-1 text-3xl font-bold text-white">
            {usage.videos_used} / {usage.videos_limit}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            残り {usage.videos_remaining} 本
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center rounded-full bg-[#fce300]/20 px-3 py-1 text-sm font-medium text-[#fce300]">
            {planLabel(usage.plan_type)}
          </span>
          {usage.plan_type === "free" && (
            <Link href="/pricing" className="mt-2 block text-sm text-[#00bdb6] hover:underline">
              プランをアップグレード →
            </Link>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#404040]">
          <div
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="今月の使用状況"
            className="h-full rounded-full bg-[#fce300]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">毎月自動リセット</p>
      </div>
    </div>
  );
}
