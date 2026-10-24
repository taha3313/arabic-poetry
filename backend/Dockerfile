FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv==0.9.0
COPY pyproject.toml uv.lock ./
COPY app ./app
RUN uv sync --frozen --no-dev --no-editable && useradd --uid 10001 --create-home bayt
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"
USER bayt
EXPOSE 8000
# Render supplies PORT; local Compose keeps 8000. One worker shares the ONNX session.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 16"]
