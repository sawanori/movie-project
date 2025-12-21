# ベストプラクティス 2025

> 調査日: 2025-12-21
> 対象: Next.js 16 / FastAPI

---

## Next.js 16 ベストプラクティス

### 1. プロジェクト構造

```
movie-maker/
├── app/                    # App Router (ルーティング)
│   ├── layout.tsx          # ルートレイアウト
│   ├── page.tsx            # ホームページ
│   ├── (auth)/             # Route Group（URLに影響しない）
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── dashboard/
│   │   ├── layout.tsx      # ネストレイアウト
│   │   ├── page.tsx
│   │   └── loading.tsx     # Suspense fallback
│   └── api/                # Route Handlers
├── components/
│   ├── ui/                 # 汎用UIコンポーネント（Button, Card, Input）
│   ├── layout/             # Header, Footer, Sidebar
│   └── features/           # 機能別コンポーネント
│       ├── auth/
│       └── video/
├── lib/                    # ユーティリティ
│   ├── api/                # APIクライアント
│   ├── utils/              # ヘルパー関数
│   └── constants/          # 定数
├── hooks/                  # カスタムフック
├── types/                  # TypeScript型定義
└── context/                # React Context
```

**ポイント:**
- `app/` にはルーティングのみ、ロジックは `lib/` や `components/` に分離
- 1つの巨大な `utils.ts` は避け、論理的にグループ分け
- ネストは3-4階層まで

---

### 2. Server Components vs Client Components

| 用途 | Server Component | Client Component |
|------|------------------|------------------|
| データフェッチ | ✅ 推奨 | ❌ |
| DB/API直接アクセス | ✅ | ❌ |
| useState/useEffect | ❌ | ✅ 必須 |
| onClick等イベント | ❌ | ✅ 必須 |
| 初期表示速度 | ✅ 高速 | △ |

**ルール:**
```tsx
// デフォルトはServer Component（何も書かない）
export default async function ProductList() {
  const products = await fetch('/api/products')
  return <div>...</div>
}

// インタラクティブな場合のみ 'use client'
'use client'
export default function AddToCartButton() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>Add</button>
}
```

**ベストプラクティス:**
- デフォルトはServer Component
- `'use client'` はコンポーネントツリーの末端（葉）に配置
- Client ComponentにServer Componentをpropsで渡すことは可能

---

### 3. Server Actions (`'use server'`)

フォーム送信やデータ変更に使用：

```tsx
// app/actions.ts
'use server'

export async function createVideo(formData: FormData) {
  const image = formData.get('image')
  // DBに保存、外部API呼び出しなど
  // クライアントにJSを送らずにサーバーで実行
}
```

```tsx
// components/VideoForm.tsx
'use client'
import { createVideo } from '@/app/actions'

export function VideoForm() {
  return (
    <form action={createVideo}>
      <input type="file" name="image" />
      <button type="submit">Generate</button>
    </form>
  )
}
```

---

### 4. Next.js 16 の新機能: Cache Components

```tsx
'use cache'

export default async function ProductList() {
  const products = await db.products.findMany()
  return <div>...</div>  // 結果がキャッシュされる
}
```

頻繁に変わらないデータ（テンプレート一覧、BGM一覧など）に最適。

---

### 5. パフォーマンス

- **Turbopack**: `npm run dev -- --turbo` で高速開発
- **画像最適化**: `next/image` を使用
- **動的インポート**: 必要時のみロード
  ```tsx
  const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
    loading: () => <Skeleton />
  })
  ```

---

## FastAPI ベストプラクティス

### 1. プロジェクト構造（ドメイン分割）

**推奨: 機能/ドメインごとに分割**

```
movie-maker-api/
├── app/
│   ├── main.py              # FastAPIアプリ エントリーポイント
│   ├── core/                # 共通設定
│   │   ├── config.py        # 環境変数
│   │   ├── security.py      # 認証ロジック
│   │   └── dependencies.py  # 共通Dependencies
│   │
│   ├── auth/                # 認証ドメイン
│   │   ├── router.py        # エンドポイント
│   │   ├── schemas.py       # Pydanticモデル
│   │   ├── service.py       # ビジネスロジック
│   │   └── dependencies.py  # 認証用Dependencies
│   │
│   ├── videos/              # 動画生成ドメイン
│   │   ├── router.py
│   │   ├── schemas.py
│   │   ├── service.py
│   │   ├── models.py        # DBモデル
│   │   └── constants.py
│   │
│   ├── templates/           # テンプレートドメイン
│   │   └── ...
│   │
│   └── external/            # 外部API連携
│       ├── kling.py         # KlingAI
│       ├── openai.py        # OpenAI
│       └── r2.py            # Cloudflare R2
│
├── tests/
│   ├── auth/
│   └── videos/
├── alembic/                 # DBマイグレーション
└── requirements.txt
```

**ポイント:**
- ファイルタイプ別（全routerを1箇所）ではなく、ドメイン別に分割
- 各ドメインが独立して完結
- Netflixの Dispatch 構造を参考

---

### 2. async/sync の使い分け

```python
# I/O処理（DB、外部API）→ async
@router.get("/videos")
async def get_videos():
    videos = await db.fetch_all(query)  # 非ブロッキング
    return videos

# CPU処理（重い計算）→ バックグラウンドワーカーへ
@router.post("/generate")
async def generate_video(background_tasks: BackgroundTasks):
    background_tasks.add_task(process_video, video_id)
    return {"status": "processing"}
```

**ルール:**
- `async def` + `await`: DB、HTTP、ファイルI/O
- CPU集約処理: Celery/RQ等のワーカーにオフロード
- 同期ライブラリ使用時: `run_in_executor` でスレッドプールへ

---

### 3. Pydantic ベストプラクティス

```python
from pydantic import BaseModel, Field, EmailStr
from datetime import datetime

# カスタムベースモデル
class AppBaseModel(BaseModel):
    class Config:
        from_attributes = True  # ORMモデルから変換可能
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# リクエスト/レスポンスを明確に分離
class VideoCreate(AppBaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    template_id: str

class VideoResponse(AppBaseModel):
    id: str
    status: str
    created_at: datetime
```

**ポイント:**
- 組み込みバリデーター活用（EmailStr, HttpUrl, conint, constr）
- Create/Update/Response でスキーマを分離
- 設定は機能ごとに分割（1つの巨大なSettingsを避ける）

---

### 4. Dependencies（依存性注入）

```python
# 認証依存関係
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Database = Depends(get_db)
) -> User:
    user = await db.get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401)
    return user

# 使用量チェック依存関係
async def check_video_quota(
    user: User = Depends(get_current_user)
) -> User:
    if user.video_count_this_month >= user.plan_limit:
        raise HTTPException(status_code=429, detail="Quota exceeded")
    return user

# ルーターで使用
@router.post("/generate")
async def generate_video(
    request: VideoCreate,
    user: User = Depends(check_video_quota)  # 認証+使用量チェック
):
    ...
```

**ポイント:**
- Dependenciesは同一リクエスト内でキャッシュされる
- 複雑なバリデーション（DB参照必要等）に活用
- 依存関係のチェーン化で再利用

---

### 5. APIバージョニング

```python
# app/main.py
from fastapi import FastAPI
from app.v1.router import router as v1_router

app = FastAPI()
app.include_router(v1_router, prefix="/api/v1")

# 将来的に
# app.include_router(v2_router, prefix="/api/v2")
```

---

### 6. エラーハンドリング

```python
from fastapi import HTTPException
from fastapi.responses import JSONResponse

# カスタム例外
class VideoGenerationError(Exception):
    def __init__(self, message: str, video_id: str):
        self.message = message
        self.video_id = video_id

# グローバルハンドラー
@app.exception_handler(VideoGenerationError)
async def video_error_handler(request, exc: VideoGenerationError):
    return JSONResponse(
        status_code=500,
        content={"error": exc.message, "video_id": exc.video_id}
    )
```

---

### 7. テスト

```python
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_video():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/v1/videos", json={
            "prompt": "test prompt",
            "template_id": "template-1"
        })
        assert response.status_code == 201
```

**ポイント:**
- `httpx.AsyncClient` を使用（requests ではなく）
- ドメインごとにテストを配置
- 依存関係をモックして単体テスト

---

## 参考資料

### Next.js
- [Next.js 公式ドキュメント](https://nextjs.org/docs/app)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Best Practices for Organizing Your Next.js 15 2025](https://dev.to/bajrayejoon/best-practices-for-organizing-your-nextjs-15-2025-53ji)

### FastAPI
- [FastAPI Best Practices (GitHub)](https://github.com/zhanymkanov/fastapi-best-practices)
- [FastAPI 公式 - Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
- [FastAPI Setup Guide 2025](https://www.zestminds.com/blog/fastapi-requirements-setup-guide-2025/)
