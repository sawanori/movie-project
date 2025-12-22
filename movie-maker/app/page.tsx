import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Video, Sparkles, Zap, Shield } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-6xl">
            画像から
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              AI動画
            </span>
            を生成
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            1枚の画像とテキストを入力するだけで、
            <br className="hidden sm:inline" />
            AIが5秒間のショート動画を自動生成します。
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg">
                <Sparkles className="mr-2 h-5 w-5" />
                無料で始める
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg">
                機能を見る
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-zinc-500">
            クレジットカード不要 ・ 7日間無料トライアル ・ 3本まで無料生成
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-zinc-50 px-4 py-24 dark:bg-zinc-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              シンプルな3ステップ
            </h2>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              難しい操作は一切不要。誰でも簡単に動画を作成できます。
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-800">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900">
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">1</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">
                画像をアップロード
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                動画のベースとなる画像を1枚アップロードします。商品写真でもポートレートでもOK。
              </p>
            </div>

            <div className="rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-800">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-900">
                <span className="text-xl font-bold text-pink-600 dark:text-pink-400">2</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">
                プロンプトを入力
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                どんな動きにしたいか、短いテキストで説明。テンプレートも用意しています。
              </p>
            </div>

            <div className="rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-800">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">3</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">
                動画をダウンロード
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                AIが自動で5秒動画を生成。BGMやテキストも追加可能。そのままSNSにシェア！
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 md:grid-cols-3">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <Zap className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">
                高速生成
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                最新のAI技術で、数分以内に高品質な動画を生成
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <Video className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">
                縦型動画対応
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                TikTok、Instagram Reels、YouTubeショートに最適化
              </p>
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
                <Shield className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-zinc-900 dark:text-white">
                著作権フリー
              </h3>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                生成した動画は商用利用OK。BGMも著作権フリー
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-zinc-900 px-4 py-24 dark:bg-zinc-800 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            今すぐ動画を作成してみましょう
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            7日間の無料トライアルで、3本まで無料で動画を生成できます。
          </p>
          <div className="mt-8">
            <Link href="/login">
              <Button size="lg" className="bg-white text-zinc-900 hover:bg-zinc-100">
                無料で始める
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 px-4 py-12 dark:border-zinc-800 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Movie Maker
              </span>
            </div>
            <p className="text-sm text-zinc-500">
              &copy; 2025 Movie Maker. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
