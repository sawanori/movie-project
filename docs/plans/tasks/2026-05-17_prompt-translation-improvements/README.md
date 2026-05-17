# タスク一覧: prompt-translation-improvements

Design Doc: `docs/plans/2026-05-17_prompt-translation-improvements.md`  
総タスク数: 16 タスク (T1-1〜T1-8, T2-1〜T2-6, T3-1, T3-2, T4-1)  
総工数: 5 日 (Phase 1: 2d / Phase 2: 1.5d / Phase 3: 1d / Phase 4: 0.5d)

---

## タスク一覧

| タスク | 概要 | 対象ファイル | 工数目安 |
|--------|------|------------|---------|
| **T1-1** | TranslateStoryPromptInput / ExtractedComponents dataclass 追加 | gemini_client.py | 0.25d |
| **T1-2** | _run_gemini_translation 分離関数 + asyncio.to_thread 化 | gemini_client.py | 0.25d |
| **T1-3** | _extract_prompt_components / _extract_dialogues_via_regex | gemini_client.py | 0.5d |
| **T1-4** | _build_translate_system_prompt / _build_reference_instruction / _sanitize_reserve_typo | gemini_client.py | 0.25d |
| **T1-5** | translate_story_prompt メイン関数実装 (A/B/C 案統合) | gemini_client.py | 0.25d |
| **T1-6** | TranslateStoryPromptResponse に extracted_dialogue 追加 | schemas.py | 0.25d |
| **T1-7** | /api/v1/videos/story/translate ルーター更新 | router.py | 0.25d |
| **T1-8** | BE 単体テスト 10 ケース追加 | tests/external/test_gemini_translate_story.py | 0.75d |
| **T2-1** | API クライアント型定義拡張 (extracted_dialogue 追加) | lib/api/client.ts | 0.25d |
| **T2-2** | PromptNode 翻訳呼び出しに subject_type 等を含める | PromptNode.tsx | 0.25d |
| **T2-3** | PromptNode に確認カード UI 追加 | PromptNode.tsx | 0.25d |
| **T2-4** | dismissedDialogueHashRef + normalizeDialogue 実装 | PromptNode.tsx | 0.25d |
| **T2-5** | createDialogueNodeFromPrompt CustomEvent + NodeEditor listener | PromptNode.tsx, NodeEditor.tsx | 0.5d |
| **T2-6** | FE 単体テスト追加 (PromptNode / NodeEditor) | *.test.tsx | 0.25d |
| **T3-1** | 統合テスト追加 (FE→API→DialogueNode フロー) | NodeEditor.integration.test.tsx | 0.5d |
| **T3-2** | 回帰確認 (既存翻訳エンドポイントが壊れていないこと) | (検証のみ) | 0.5d |
| **T4-1** | 品質ゲート実行 + 手動 E2E QA | (検証のみ) | 0.5d |

---

## 依存関係図

```
T1-1 (dataclass 基盤)
├── T1-2 (_run_gemini_translation)    ─ T1-1 後並列可
├── T1-3 (_extract_prompt_components) ─ T1-1 後並列可
├── T1-4 (_build_translate_system)    ─ T1-1 後並列可
└── T1-6 (schema: extracted_dialogue) ─ T1-1 後並列可

T1-2 + T1-3 + T1-4 → T1-5 (translate_story_prompt 統合)

T1-5 + T1-6 → T1-7 (router 更新)

T1-7 → T1-8 (BE テスト)

T1-8 完了 (Phase 1 完了) ──────────────────────────────────┐
                                                           │
T2-1 (client.ts 型)                                        │
├── T2-2 (PromptNode: subject_type 送信) ─ T2-1 後並列可  │
├── T2-3 (PromptNode: 確認カード UI)     ─ T2-1 後並列可  │
└── T2-4 (PromptNode: dismiss hash)      ─ T2-1 後並列可  │

T2-3 → T2-5 (CustomEvent + NodeEditor listener)

T2-1〜T2-5 完了 → T2-6 (FE テスト)

T2-6 完了 (Phase 2 完了) ──────────────────────────────────┤
                                                           │
T3-1 (統合テスト) ─ Phase 1 + Phase 2 完了後              │
T3-2 (回帰確認)   ─ Phase 1 + Phase 2 完了後              │
                                                           │
T4-1 (品質ゲート) ─ Phase 1 + 2 + 3 全完了後 ─────────────┘
```

---

## 推奨実行順と並列最適化

### 推奨実行順 (線形・安全)

```
T1-1 → T1-2 → T1-3 → T1-4 → T1-5 → T1-6 → T1-7 → T1-8
      → T2-1 → T2-2 → T2-3 → T2-4 → T2-5 → T2-6
      → T3-1 → T3-2
      → T4-1
```

### 並列実行ポイント (経験豊富な実装者向け)

**並列グループ 1**: T1-1 完了後に以下 4 タスクを並列着手可能

```
T1-1 完了
  ├── T1-2 (agent A)
  ├── T1-3 (agent B)
  ├── T1-4 (agent C)
  └── T1-6 (agent D)
```

注意: T1-2/T1-3/T1-4 は全て `gemini_client.py` への追加なので、同一ファイルへの変更を避けるため agent 分担時はマージ順序を決めておくこと。

**並列グループ 2**: T1-5 完了後 (T1-7 は T1-6 も必要)

```
T1-5 完了 + T1-6 完了 → T1-7
```

**並列グループ 3**: T2-1 完了後

```
T2-1 完了
  ├── T2-2 (agent A: PromptNode useEffect 修正)
  ├── T2-3 (agent B: 確認カード UI)
  └── T2-4 (agent C: dismiss hash)
```

注意: T2-2/T2-3/T2-4 は同一ファイル (`PromptNode.tsx`) なのでマージ順序:
1. T2-2 マージ
2. T2-3 を T2-2 の上に積む
3. T2-4 を T2-3 の上に積む

**並列グループ 4**: Phase 1 + Phase 2 完了後

```
T3-1 (agent A) ─ 並列可
T3-2 (agent B) ─ 並列可
```

---

## 各タスクの完了検証コマンド早見表

| タスク | 検証コマンド |
|--------|------------|
| T1-1 | `python -c "from app.external.gemini_client import TranslateStoryPromptInput, ExtractedComponents; print('OK')"` |
| T1-2 | `python -c "from app.external.gemini_client import _run_gemini_translation; import inspect; assert inspect.iscoroutinefunction(_run_gemini_translation)"` |
| T1-3 | `python -c "from app.external.gemini_client import _extract_dialogues_via_regex; assert _extract_dialogues_via_regex('「test」') == 'test'"` |
| T1-4 | `python -c "from app.external.gemini_client import _sanitize_reserve_typo; assert 'Reserve' not in _sanitize_reserve_typo('Reserve exact appearance')"` |
| T1-5 | `python -c "from app.external.gemini_client import translate_story_prompt; import inspect; assert inspect.iscoroutinefunction(translate_story_prompt)"` |
| T1-6 | `python -c "from app.videos.schemas import TranslateStoryPromptResponse; r = TranslateStoryPromptResponse(english_prompt='ok'); assert r.extracted_dialogue is None"` |
| T1-7 | `pytest tests/ -v -q --ignore=tests/videos/test_text_to_image.py --ignore=tests/library/` |
| T1-8 | `pytest tests/external/test_gemini_translate_story.py -v` |
| T2-1 | `npx tsc --noEmit` |
| T2-2〜T2-5 | `npx tsc --noEmit && npm run lint` |
| T2-6 | `npm run test -- components/node-editor` |
| T3-1 | `npm run test -- components/node-editor/__tests__/NodeEditor.integration` |
| T3-2 | `pytest tests/ -v -q && npx tsc --noEmit && npm run test` |
| T4-1 | `npm run build && npm run test:e2e` |

---

## 重要な実装上の注意

1. **`gemini_client.py` は大きなファイル**: 追加する 7 関数 + 2 dataclass はファイル末尾に追記するのではなく、Design Doc で指定した順序 (T1-1 dataclass → T1-2 `_run_gemini_translation` → T1-3 抽出関数 → T1-4 ビルダー関数 → T1-5 メイン関数) で追加すること

2. **既存 `translate_scene_to_runway_prompt` は変更しない**: 新関数 `translate_story_prompt` を別途追加する。router.py でも既存の `/storyboard/translate-scene` ハンドラは触れない

3. **`ExtractedComponents.dialogue` だけが `Optional[str]`**: 他フィールドは必ず `str`。この契約を守ることで `_build_translate_system_prompt` 内の None チェックが不要になる

4. **PromptNode.tsx は T2-2 → T2-3 → T2-4 → T2-5 の順でマージ**: 各タスクが前のタスクの変更を前提にしているため、並列着手する場合はブランチ管理に注意

5. **`dismissedDialogueHashRef` は `useEffect` の依存配列に含めない**: `useRef` の値は ref のため、配列に含めると無限ループのリスクがある (N1 対応)
