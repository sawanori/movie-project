"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Check,
  Sparkles,
  Zap,
  Building2,
  ArrowRight,
} from "lucide-react";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  videos: number;
  icon: React.ElementType;
  features: PlanFeature[];
  popular?: boolean;
  cta: string;
}

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "個人クリエイター向け",
    price: 4.99,
    videos: 5,
    icon: Sparkles,
    cta: "Starterを始める",
    features: [
      { text: "月間5本の動画生成", included: true },
      { text: "テンプレートギャラリー（20種類）", included: true },
      { text: "自動テキスト挿入", included: true },
      { text: "生成履歴と再利用", included: true },
      { text: "メールサポート", included: true },
      { text: "プロンプト自動最適化", included: false },
      { text: "BGM・効果音の自動選曲", included: false },
      { text: "高解像度動画（1080p）", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "小規模ビジネス向け",
    price: 9.99,
    videos: 15,
    icon: Zap,
    popular: true,
    cta: "Proを始める",
    features: [
      { text: "月間15本の動画生成", included: true },
      { text: "Starterの全機能", included: true },
      { text: "プロンプト自動最適化（GPT-4）", included: true },
      { text: "スタイル・トーン制御", included: true },
      { text: "動画バリエーション生成", included: true },
      { text: "BGM・効果音の自動選曲", included: true },
      { text: "高解像度動画（1080p）", included: true },
      { text: "優先メールサポート", included: true },
    ],
  },
  {
    id: "business",
    name: "Business",
    description: "中規模企業向け",
    price: 24.99,
    videos: 50,
    icon: Building2,
    cta: "Businessを始める",
    features: [
      { text: "月間50本の動画生成", included: true },
      { text: "Proの全機能", included: true },
      { text: "バッチ生成・スケジューリング", included: true },
      { text: "外部API連携（Shopify等）", included: true },
      { text: "パフォーマンス分析", included: true },
      { text: "カスタムブランディング", included: true },
      { text: "REST APIアクセス", included: true },
      { text: "最高解像度動画（4K）", included: true },
      { text: "月1回の戦略コンサルティング", included: true },
    ],
  },
];

const faqs = [
  {
    question: "無料トライアルはありますか？",
    answer:
      "はい、7日間の無料トライアルで3本まで動画を生成できます。クレジットカードの登録は不要です。",
  },
  {
    question: "プランの変更はいつでもできますか？",
    answer:
      "はい、いつでもプランをアップグレードまたはダウングレードできます。変更は次の請求サイクルから適用されます。",
  },
  {
    question: "生成した動画の著作権は？",
    answer:
      "生成した動画の著作権はすべてお客様に帰属します。商用利用も可能です。",
  },
  {
    question: "支払い方法は何がありますか？",
    answer:
      "クレジットカード（Visa、Mastercard、American Express）およびデビットカードでお支払いいただけます。",
  },
  {
    question: "解約したらどうなりますか？",
    answer:
      "解約後も現在の請求期間が終了するまではサービスをご利用いただけます。生成した動画は30日間ダウンロード可能です。",
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly"
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
            シンプルな料金体系
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            あなたのニーズに合ったプランをお選びください。
            すべてのプランに7日間の無料トライアルが含まれます。
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center gap-4 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                billingCycle === "monthly"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400"
              )}
            >
              月額
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                billingCycle === "yearly"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400"
              )}
            >
              年額
              <span className="ml-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900 dark:text-green-300">
                20%OFF
              </span>
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const displayPrice =
              billingCycle === "yearly"
                ? (plan.price * 12 * 0.8).toFixed(2)
                : plan.price.toFixed(2);

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-900",
                  plan.popular &&
                    "ring-2 ring-purple-500 dark:ring-purple-400"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-purple-500 px-4 py-1 text-sm font-medium text-white">
                      人気
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl",
                      plan.popular
                        ? "bg-purple-100 dark:bg-purple-900"
                        : "bg-zinc-100 dark:bg-zinc-800"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        plan.popular
                          ? "text-purple-600 dark:text-purple-400"
                          : "text-zinc-600 dark:text-zinc-400"
                      )}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {plan.description}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-zinc-900 dark:text-white">
                      ${displayPrice}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      /{billingCycle === "yearly" ? "年" : "月"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    月{plan.videos}本の動画生成
                  </p>
                </div>

                <Link
                  href={user ? "/dashboard" : "/login"}
                  className="mt-6 block"
                >
                  <Button
                    className={cn(
                      "w-full",
                      plan.popular
                        ? "bg-purple-600 hover:bg-purple-700"
                        : ""
                    )}
                    variant={plan.popular ? "default" : "outline"}
                  >
                    {plan.cta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                <ul className="mt-8 space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check
                        className={cn(
                          "mt-0.5 h-5 w-5 shrink-0",
                          feature.included
                            ? "text-green-500"
                            : "text-zinc-300 dark:text-zinc-700"
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm",
                          feature.included
                            ? "text-zinc-700 dark:text-zinc-300"
                            : "text-zinc-400 dark:text-zinc-600 line-through"
                        )}
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Free Trial Banner */}
        <div className="mt-16 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 p-8 text-center text-white">
          <h2 className="text-2xl font-bold">7日間無料で試す</h2>
          <p className="mt-2 text-purple-100">
            クレジットカード不要。3本まで無料で動画を生成できます。
          </p>
          <Link href={user ? "/generate" : "/login"} className="mt-6 inline-block">
            <Button
              size="lg"
              className="bg-white text-purple-600 hover:bg-purple-50"
            >
              無料トライアルを開始
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <h2 className="text-center text-2xl font-bold text-zinc-900 dark:text-white">
            よくある質問
          </h2>
          <div className="mx-auto mt-10 max-w-3xl space-y-6">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-white p-6 shadow-sm dark:bg-zinc-900"
              >
                <h3 className="font-semibold text-zinc-900 dark:text-white">
                  {faq.question}
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
            今すぐ始めましょう
          </h2>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            数分で最初の動画を生成できます
          </p>
          <Link href={user ? "/generate" : "/login"} className="mt-6 inline-block">
            <Button size="lg">
              無料で始める
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-zinc-200 py-8 dark:border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <p>&copy; 2025 movie-maker. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
