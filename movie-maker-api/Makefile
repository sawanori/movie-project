.PHONY: dev start test install clean

# 開発サーバー起動
dev:
	. venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 本番モード起動
start:
	. venv/bin/activate && uvicorn app.main:app --port 8000

# テスト実行
test:
	. venv/bin/activate && pytest

# 依存関係インストール
install:
	python3 -m venv venv
	. venv/bin/activate && pip install -r requirements.txt

# キャッシュ削除
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
