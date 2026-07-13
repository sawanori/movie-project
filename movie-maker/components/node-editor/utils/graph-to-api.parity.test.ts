/**
 * graph-to-api.parity.test.ts
 *
 * フロント graph-to-api.ts とバックエンド workflow_engine.compile_graph の
 * Generate ペイロード意味論一致を機械検証するパリティテスト。
 *
 * バックエンドと同一の単一正本 fixture
 *   movie-maker-api/tests/services/fixtures/parity_graphs.json
 * を monorepo 境界を越えて直接読み込む (コピーによる二重管理を避けるため)。
 * バックエンド tests/services/test_workflow_engine.py も同じファイルを読む。
 *
 * 受け渡し規約 (fixture の _readme):
 *   graph-to-api.ts が Generate ペイロードの最終的な正。実出力が fixture の
 *   expectedPayload とズレた場合は fixture 側を graph-to-api.ts の実出力に合わせて修正する
 *   (graph-to-api.ts を fixture に合わせて変えない)。修正時はバックエンドテストも再実行する。
 *
 * キー集合の厳密一致を検証する (省略キー = そのフィールドが undefined で存在しないこと。
 * graph-to-api.ts の undefined-omit と揃える)。
 *
 * NOTE: graph-to-api.ts は一部フィールド (camera_work / bgm_track_id / custom_bgm_url) を
 * リテラルで `値 || undefined` として代入するため、JS オブジェクト上は「値が undefined のキー」
 * として存在する。これらは JSON.stringify で送信時に脱落し、実際のペイロード上は「存在しない」。
 * fixture の _readme も「省略キー = undefined = 存在しない」と定義しているため、比較前に
 * undefined 値のキーを取り除いた「実送信ペイロード」で照合する (= fixture の意味論と一致)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Edge } from '@xyflow/react';
import { graphToStoryVideoCreate } from './graph-to-api';
import type {
  WorkflowNode,
  StoryVideoCreateRequest,
} from '@/lib/types/node-editor';

const HERE = dirname(fileURLToPath(import.meta.url));
// movie-maker/components/node-editor/utils -> movie-project ルート下の movie-maker-api
const FIXTURE_PATH = resolve(
  HERE,
  '../../../../movie-maker-api/tests/services/fixtures/parity_graphs.json',
);

interface ParityCase {
  name: string;
  note?: string;
  generateNodeId: string;
  graph: { nodes: WorkflowNode[]; edges: Edge[] };
  expectedPayload: Record<string, unknown>;
}

interface ParityFixture {
  cases: ParityCase[];
}

function loadFixture(): ParityFixture {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  return JSON.parse(raw) as ParityFixture;
}

const fixture = loadFixture();

describe('graph-to-api parity (shared backend fixture)', () => {
  it('fixture が代表ケースを 1 件以上含む', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  for (const testCase of fixture.cases) {
    it(`${testCase.name}: graph-to-api.ts 出力が期待 Generate ペイロードと一致する`, () => {
      const { nodes, edges } = testCase.graph;
      const rawActual: StoryVideoCreateRequest = graphToStoryVideoCreate(
        nodes,
        edges,
        testCase.generateNodeId,
      );

      // 実送信ペイロード: undefined 値のキーを除去 (JSON.stringify での脱落と等価)。
      const actual = Object.fromEntries(
        Object.entries(rawActual).filter(([, v]) => v !== undefined),
      );

      const actualKeys = Object.keys(actual).sort();
      const expectedKeys = Object.keys(testCase.expectedPayload).sort();

      // キー集合の厳密一致 (省略キーは存在しないこと)
      expect(actualKeys, `${testCase.name}: キー集合不一致`).toEqual(expectedKeys);

      // 各フィールドの値一致
      for (const [key, expectedValue] of Object.entries(testCase.expectedPayload)) {
        expect(
          actual[key],
          `${testCase.name}: フィールド '${key}' 不一致`,
        ).toEqual(expectedValue);
      }
    });
  }
});
