.PHONY: setup backend frontend test build
setup:
	cd backend && uv sync
	cd frontend && npm ci
backend:
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
frontend:
	cd frontend && npm run dev
test:
	cd backend && uv run pytest
build:
	cd frontend && npm run build
