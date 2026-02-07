import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  Video,
  Film,
  Clapperboard,
  Combine,
  Camera,
  Palette,
  Wand2,
  Play,
  ArrowRight,
  Ratio,
  Zap,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#212121] text-white overflow-x-hidden">
      <Header />

      {/* Subtle Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Accent glow - yellow */}
        <div
          className="absolute top-[10%] right-[-20%] w-[800px] h-[800px] rounded-full blur-[200px] animate-glow-pulse"
          style={{ background: "radial-gradient(circle, rgba(252,227,0,0.08) 0%, transparent 70%)" }}
        />
        {/* Secondary glow - teal */}
        <div
          className="absolute bottom-[10%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[180px] animate-glow-pulse"
          style={{ background: "radial-gradient(circle, rgba(0,189,182,0.06) 0%, transparent 70%)", animationDelay: "1.5s" }}
        />
        {/* Subtle grain texture */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Hero Section - Asymmetric Layout */}
      <section className="relative px-6 pt-16 pb-24 lg:px-12 lg:pt-24 lg:pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-12 gap-6 lg:gap-8 items-center">
            {/* Left Content - 7 columns */}
            <div className="col-span-12 lg:col-span-7 space-y-8">
              {/* Eyebrow */}
              <div className="opacity-0 animate-slide-up">
                <span className="inline-flex items-center gap-2 text-sm text-gray-400 font-medium tracking-wide">
                  <span className="w-8 h-px bg-[#fce300]" />
                  AI動画生成プラットフォーム
                </span>
              </div>

              {/* Headline */}
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight opacity-0 animate-slide-up delay-100">
                <span className="block text-white">吾輩は動画生成AI</span>
                <span className="block mt-2">
                  <span className="text-[#fce300]">名前</span>
                  <span className="text-white">はまだない</span>
                </span>
              </h1>

              {/* Subhead */}
              <p className="max-w-lg text-lg text-gray-400 leading-relaxed opacity-0 animate-slide-up delay-200">
                1枚の画像からプロ品質の動画素材を自動生成。
                <br />
                <span className="text-gray-300">Runway・Veo・DomoAI</span>を
                使い分けて、最適な映像を制作。
              </p>

              {/* CTA */}
              <div className="flex flex-wrap items-center gap-4 pt-4 opacity-0 animate-slide-up delay-300">
                <Link href="/login">
                  <Button
                    size="lg"
                    className="btn-hover bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold px-8 py-6 text-base border-0 shadow-lg shadow-[#fce300]/20"
                  >
                    無料で始める
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="#modes" className="group">
                  <span className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                    <span className="w-10 h-10 rounded-full border border-[#404040] flex items-center justify-center group-hover:border-[#00bdb6] group-hover:text-[#00bdb6] transition-colors">
                      <Play className="w-4 h-4 ml-0.5" />
                    </span>
                    <span className="text-sm font-medium">機能を見る</span>
                  </span>
                </Link>
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-8 pt-8 border-t border-[#333333] opacity-0 animate-slide-up delay-400">
                <div>
                  <div className="font-display text-3xl text-white">3</div>
                  <div className="text-sm text-gray-500 mt-1">制作モード</div>
                </div>
                <div className="w-px h-10 bg-[#333333]" />
                <div>
                  <div className="font-display text-3xl text-white">3</div>
                  <div className="text-sm text-gray-500 mt-1">AIエンジン</div>
                </div>
                <div className="w-px h-10 bg-[#333333]" />
                <div>
                  <div className="font-display text-3xl text-[#00bdb6]">∞</div>
                  <div className="text-sm text-gray-500 mt-1">クリエイティブ</div>
                </div>
              </div>
            </div>

            {/* Right Visual - 5 columns */}
            <div className="col-span-12 lg:col-span-5 relative">
              <div className="relative h-[400px] lg:h-[560px] opacity-0 animate-slide-up delay-200">
                {/* Film strip visual */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Main frame */}
                  <div className="relative w-[240px] sm:w-[280px] aspect-[9/16] rounded-2xl bg-[#2a2a2a] border border-[#404040] overflow-hidden shadow-2xl shadow-black/30 animate-float">
                    {/* Film perforations */}
                    <div className="absolute left-2 top-0 bottom-0 w-3 flex flex-col justify-around py-4">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-3 h-4 rounded-sm bg-[#212121] border border-[#333333]" />
                      ))}
                    </div>
                    <div className="absolute right-2 top-0 bottom-0 w-3 flex flex-col justify-around py-4">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-3 h-4 rounded-sm bg-[#212121] border border-[#333333]" />
                      ))}
                    </div>
                    {/* Content area */}
                    <div className="absolute inset-x-8 inset-y-4 bg-gradient-to-br from-[#333333] to-[#2a2a2a] rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto rounded-full bg-[#fce300]/10 border border-[#fce300]/30 flex items-center justify-center">
                          <Play className="w-7 h-7 text-[#fce300] ml-1" />
                        </div>
                        <p className="mt-4 text-sm text-gray-400">生成された動画</p>
                      </div>
                    </div>
                    {/* Timecode */}
                    <div className="absolute bottom-6 left-10 right-10 flex justify-between text-xs text-gray-600 font-mono">
                      <span>00:00:00</span>
                      <span>9:16</span>
                    </div>
                  </div>
                </div>

                {/* Decorative elements */}
                <div className="absolute top-8 right-4 w-20 h-20 rounded-xl bg-[#2a2a2a]/50 border border-[#333333] flex items-center justify-center opacity-60">
                  <Camera className="w-8 h-8 text-gray-600" />
                </div>
                <div className="absolute bottom-12 left-0 w-16 h-16 rounded-lg bg-[#00bdb6]/10 border border-[#00bdb6]/30 flex items-center justify-center">
                  <Film className="w-6 h-6 text-[#00bdb6]/60" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modes Section - Broken Grid Layout */}
      <section id="modes" className="relative px-6 py-24 lg:px-12 lg:py-32 bg-[#1a1a1a]">
        <div className="mx-auto max-w-7xl">
          {/* Section Header - Left aligned */}
          <div className="max-w-2xl mb-16 opacity-0 animate-slide-up">
            <span className="inline-flex items-center gap-2 text-sm text-gray-500 font-medium tracking-wide mb-4">
              <span className="w-2 h-2 rounded-full bg-[#fce300]" />
              CREATION MODES
            </span>
            <h2 className="font-display text-4xl sm:text-5xl text-white">
              3つの制作モード
            </h2>
            <p className="mt-4 text-gray-400 text-lg">
              用途に合わせて最適なワークフローを選択
            </p>
          </div>

          {/* Cards - Asymmetric grid */}
          <div className="grid grid-cols-12 gap-4 lg:gap-6">
            {/* Card 1 - Large (8 cols) */}
            <Link href="/generate/story" className="col-span-12 lg:col-span-8 group">
              <div className="card-hover relative h-full p-8 lg:p-10 rounded-2xl bg-[#2a2a2a] border border-[#333333] overflow-hidden">
                {/* Accent line */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#fce300] via-[#fce300]/50 to-transparent" />

                <div className="relative z-10">
                  <div className="flex items-start justify-between">
                    <div className="w-14 h-14 rounded-xl bg-[#fce300]/10 border border-[#fce300]/30 flex items-center justify-center">
                      <Film className="w-7 h-7 text-[#fce300]" />
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#fce300]/10 text-[#fce300] text-xs font-medium">
                      人気
                    </span>
                  </div>

                  <h3 className="font-display text-2xl lg:text-3xl text-white mt-6">
                    ワンシーン生成
                  </h3>
                  <p className="mt-3 text-gray-400 leading-relaxed max-w-lg">
                    1枚の画像から動画クリップを生成。AIが最適な動きを提案し、
                    数クリックで動画素材が完成。広告やSNS用のパーツ制作に最適。
                  </p>

                  <div className="flex flex-wrap gap-2 mt-6">
                    <span className="px-3 py-1.5 rounded-lg bg-[#333333] text-gray-400 text-sm">パーツ作成</span>
                    <span className="px-3 py-1.5 rounded-lg bg-[#333333] text-gray-400 text-sm">素材制作</span>
                    <span className="px-3 py-1.5 rounded-lg bg-[#333333] text-gray-400 text-sm">SNS向け</span>
                  </div>

                  <div className="mt-8 flex items-center text-[#fce300] font-medium group-hover:gap-3 gap-2 transition-all">
                    試してみる <ArrowRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </Link>

            {/* Card 2 - Small (4 cols) */}
            <Link href="/generate/storyboard" className="col-span-12 sm:col-span-6 lg:col-span-4 group">
              <div className="card-hover relative h-full p-6 lg:p-8 rounded-2xl bg-[#2a2a2a] border border-[#333333] overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-[#00bdb6]/10 border border-[#00bdb6]/30 flex items-center justify-center">
                  <Clapperboard className="w-6 h-6 text-[#00bdb6]" />
                </div>

                <h3 className="font-display text-xl text-white mt-5">
                  ストーリー生成
                </h3>
                <p className="mt-2 text-gray-500 text-sm leading-relaxed">
                  起承転結でAIがシナリオを自動生成。複数シーンを一括で動画化。
                </p>

                <div className="mt-6 flex items-center text-[#00bdb6] text-sm font-medium group-hover:text-[#00d4cc] transition-colors">
                  詳しく見る <ArrowRight className="ml-2 w-4 h-4" />
                </div>
              </div>
            </Link>

            {/* Card 3 - Small (4 cols) - decorative */}
            <div className="col-span-12 sm:col-span-6 lg:col-span-4 p-6 lg:p-8 rounded-2xl bg-[#252525] border border-[#2a2a2a] flex flex-col justify-center">
              <div className="text-5xl font-display text-[#333333]">01</div>
              <p className="mt-2 text-gray-600 text-sm">素材を生成</p>
            </div>

            {/* Card 4 - Large (8 cols) */}
            <Link href="/concat" className="col-span-12 lg:col-span-8 group">
              <div className="card-hover relative h-full p-8 lg:p-10 rounded-2xl bg-[#2a2a2a] border border-[#333333] overflow-hidden">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-xl bg-[#333333] flex items-center justify-center shrink-0">
                    <Combine className="w-7 h-7 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-display text-2xl lg:text-3xl text-white">
                      アドクリエイター
                    </h3>
                    <p className="mt-3 text-gray-400 leading-relaxed">
                      生成した動画を自由に組み合わせ。トリミング・トランジション・BGM追加で、
                      完成度の高い広告動画を制作。
                    </p>

                    <div className="flex flex-wrap gap-2 mt-6">
                      <span className="px-3 py-1.5 rounded-lg bg-[#333333] text-gray-400 text-sm">動画結合</span>
                      <span className="px-3 py-1.5 rounded-lg bg-[#333333] text-gray-400 text-sm">トランジション</span>
                      <span className="px-3 py-1.5 rounded-lg bg-[#333333] text-gray-400 text-sm">BGM追加</span>
                    </div>

                    <div className="mt-8 flex items-center text-gray-400 font-medium group-hover:text-white group-hover:gap-3 gap-2 transition-all">
                      試してみる <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Pro Features */}
      <section className="relative px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-7xl">
          {/* Section Header */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
            <div>
              <span className="inline-flex items-center gap-2 text-sm text-gray-500 font-medium tracking-wide mb-4">
                <span className="w-2 h-2 rounded-full bg-gray-600" />
                PRO FEATURES
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-white">
                プロ向け機能
              </h2>
            </div>
            <p className="text-gray-500 max-w-md">
              映像制作のプロフェッショナルが求める細部へのこだわりを実現
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-6 rounded-xl bg-[#2a2a2a]/60 border border-[#333333] group hover:border-[#404040] transition-colors">
              <Wand2 className="w-8 h-8 text-gray-500 group-hover:text-[#fce300] transition-colors" />
              <h3 className="font-display text-lg text-gray-200 mt-4">複数エンジン</h3>
              <p className="mt-2 text-gray-500 text-sm">Runway・Veo・DomoAI</p>
            </div>

            <div className="p-6 rounded-xl bg-[#2a2a2a]/60 border border-[#333333] group hover:border-[#404040] transition-colors">
              <Ratio className="w-8 h-8 text-gray-500 group-hover:text-[#fce300] transition-colors" />
              <h3 className="font-display text-lg text-gray-200 mt-4">アスペクト比</h3>
              <p className="mt-2 text-gray-500 text-sm">9:16 / 16:9 / 1:1</p>
            </div>

            <div className="p-6 rounded-xl bg-[#2a2a2a]/60 border border-[#333333] group hover:border-[#404040] transition-colors">
              <Camera className="w-8 h-8 text-gray-500 group-hover:text-[#fce300] transition-colors" />
              <h3 className="font-display text-lg text-gray-200 mt-4">カメラワーク</h3>
              <p className="mt-2 text-gray-500 text-sm">パン・ズーム・トラッキング</p>
            </div>

            <div className="p-6 rounded-xl bg-[#2a2a2a]/60 border border-[#333333] group hover:border-[#404040] transition-colors">
              <Palette className="w-8 h-8 text-gray-500 group-hover:text-[#fce300] transition-colors" />
              <h3 className="font-display text-lg text-gray-200 mt-4">BGM・テキスト</h3>
              <p className="mt-2 text-gray-500 text-sm">オーバーレイ・音楽追加</p>
            </div>
          </div>

          {/* Act-Two Highlight */}
          <div className="mt-8 p-8 lg:p-10 rounded-2xl bg-gradient-to-r from-[#2a2a2a] via-[#2a2a2a]/80 to-[#2a2a2a]/60 border border-[#333333] relative overflow-hidden">
            {/* Subtle accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00bdb6]/5 rounded-full blur-3xl" />

            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="flex items-start gap-5">
                <div className="w-14 h-14 rounded-xl bg-[#00bdb6]/10 border border-[#00bdb6]/30 flex items-center justify-center shrink-0">
                  <Zap className="w-7 h-7 text-[#00bdb6]" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-display text-2xl text-white">Act-Two モード</h3>
                    <span className="px-2 py-0.5 rounded bg-[#00bdb6]/10 text-[#00bdb6] text-xs font-medium uppercase tracking-wide">
                      Advanced
                    </span>
                  </div>
                  <p className="mt-2 text-gray-400 max-w-xl">
                    人物の精密動作制御。パフォーマンス動画を参照し、表情・ジェスチャー・体の動きを自然に再現。
                  </p>
                </div>
              </div>
              <Link href="/generate/story">
                <Button variant="outline" className="btn-hover shrink-0 border-[#404040] text-gray-300 hover:bg-[#333333] hover:text-white">
                  試してみる
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-6 py-24 lg:px-12 lg:py-32">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl text-white">
            映像制作を、
            <br />
            <span className="text-[#fce300]">はじめよう。</span>
          </h2>
          <p className="mt-6 text-gray-400 text-lg max-w-lg mx-auto">
            画像をアップロードするだけで、AIが動画を生成。
            クリエイティブな映像制作を、もっと手軽に。
          </p>
          <div className="mt-10">
            <Link href="/login">
              <Button
                size="lg"
                className="btn-hover bg-[#fce300] hover:bg-[#e5cf00] text-[#212121] font-semibold px-10 py-7 text-lg border-0 shadow-xl shadow-[#fce300]/20"
              >
                無料で始める
                <ArrowRight className="ml-3 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-[#333333] px-6 py-10 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#fce300] flex items-center justify-center">
                <Video className="h-4 w-4 text-[#212121]" />
              </div>
              <span className="text-sm font-medium text-gray-400">
                名もなき映像ジェネレーター
              </span>
            </div>
            <p className="text-sm text-gray-600">
              &copy; 2025 名もなき映像ジェネレーター
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
