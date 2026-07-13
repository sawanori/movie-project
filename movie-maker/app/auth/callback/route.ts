import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  // オープンリダイレクト対策: 相対パスのみ許可し、外部/プロトコル相対 (//host) を弾く
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
  } else {
    // 機微パラメータ (単回使用の OAuth code 等) はログに出さない
    console.error("[auth/callback] No code parameter in URL.");
  }

  // エラー時はログインページにリダイレクト
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
