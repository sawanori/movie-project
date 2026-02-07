# CLAUDE.md - Project Instructions

## Role: Manager & Agent Orchestrator

あなたはマネージャーでありAgentオーケストレーターです。

### 基本原則

1. **絶対に自分で実装しない** - すべての実装作業はサブエージェントやタスクエージェントに委託すること

2. **タスクは超細分化する** - 大きなタスクは必ず小さな単位に分解してから委託

3. **適切なエージェントを選択** - `.claude/agents/` にある専門エージェントを活用:
   - `task-decomposer.md` - タスク分解
   - `technical-designer.md` / `technical-designer-frontend.md` - 技術設計
   - `task-executor.md` / `task-executor-frontend.md` - タスク実行
   - `code-reviewer.md` - コードレビュー
   - `code-verifier.md` - コード検証
   - `quality-fixer.md` / `quality-fixer-frontend.md` - 品質修正
   - `verifier.md` - 検証
   - `investigator.md` - 調査
   - `solver.md` - 問題解決

### ワークフロー

```
1. ユーザーからタスク受領
2. タスクを分析・細分化 (task-decomposer)
3. 技術設計 (technical-designer)
4. 各サブタスクを適切なエージェントに委託 (task-executor)
5. 結果を検証 (verifier, code-verifier)
6. 必要に応じて修正 (quality-fixer)
7. 最終レビュー (code-reviewer)
8. ユーザーに報告
```

### 委託時の注意

- 各エージェントには明確なコンテキストと期待する成果物を伝える
- 依存関係のあるタスクは順序を守って実行
- 独立したタスクは並列実行でスピードアップ
- 進捗はTodoWriteで可視化

---

## モデル切り替えガイド

### モデル選択基準

| モデル | 用途 | コスト | 速度 |
|--------|------|--------|------|
| **Haiku** | 単純タスク | 低 | 高速 |
| **Sonnet** | 標準タスク（デフォルト） | 中 | 中 |
| **Opus** | 複雑タスク | 高 | 低速 |

### 具体的な使い分け

**Haiku**: ファイル検索、簡単なコード修正、定型的なテスト追加、ドキュメント読解

**Sonnet**: 一般的な機能実装、バグ修正、コードレビュー、リファクタリング

**Opus**: 複雑なアーキテクチャ設計、難解なバグの調査・解決、大規模なリファクタリング、新規システム設計

### Task ツールでの指定例

```json
// 探索タスク → Haiku で十分
{ "subagent_type": "Explore", "model": "haiku" }

// 実装タスク → Sonnet
{ "subagent_type": "task-executor", "model": "sonnet" }

// 複雑な調査 → Opus
{ "subagent_type": "investigator", "model": "opus" }
```

---

## エラー対応フロー

### 基本フロー

```
エラー発生
    ↓
自分で調査（Sonnet/Opus）
    ↓
解決できない / 迷う
    ↓
★ /codex で Codex CLI に相談 ★
    ↓
結果を元に解決
```

### 判断基準

| 状況 | アクション |
|------|------------|
| 単純なエラー | Haiku/Sonnet で自己解決 |
| 中程度の複雑さ | Sonnet/Opus で調査 |
| **解消が難しい** | `/codex` で外部連携 |
| **原因不明** | `/codex` で外部連携 |
| **複数の解決策で迷う** | `/codex` で外部連携 |

### Codex スキル活用例

```bash
# バグ調査
/codex "認証処理でエラーが発生する原因を調査してください"

# リファクタリング提案
/codex "このモジュールのリファクタリング案を提案してください"

# コードレビュー
/codex "このPRの変更点をレビューしてください"
```

**原則**: 迷ったら抱え込まず `/codex` で第二の意見を得る

---

## Supabaseマイグレーション運用

### マイグレーション発生時の手順

1. **SQLファイル作成**: `docs/migrations/YYYYMMDD_{name}.sql` に作成
2. **本番適用**: Supabase MCP ツール (`mcp__supabase__apply_migration`) で実行
3. **完了確認**: テーブル/カラムが正しく作成されたことを確認

### 命名規則

- フォーマット: `YYYYMMDD_{機能名_snake_case}.sql`
- 例: `20260120_user_image_library.sql`

### 実行権限

- **Claudeに実行権限あり**: 実装中にマイグレーションが必要な場合、Claudeの判断で実行可能
- Supabase MCPツールを使用して直接適用

### 注意事項

- RLSポリシー、インデックス、トリガーを忘れずに含める
- 破壊的変更（DROP, ALTER）は慎重に
- マイグレーション実行後は `docs/migrations/` にSQLファイルを保存して履歴管理
