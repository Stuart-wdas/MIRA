FROM node:22-alpine AS beta-builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src/beta ./src/beta
COPY vite.beta.config.ts ./
RUN npx vite build --config vite.beta.config.ts

FROM ghcr.io/nerfstudio-project/nerfstudio:1.1.5

USER root
WORKDIR /app

COPY worker/requirements-api.txt /app/worker/requirements-api.txt
RUN python -m pip install --no-cache-dir -r /app/worker/requirements-api.txt

COPY worker /app/worker
COPY --from=beta-builder /build/worker/beta-dist /app/worker/beta-dist

ENV MIRA_DATA_ROOT=/data \
    MIRA_TRAIN_STEPS=10000 \
    MIRA_METRICS_POLL_SECONDS=5 \
    MIRA_TRAIN_LOG_SAMPLES=100 \
    MIRA_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 \
    TORCH_CUDA_ARCH_LIST=8.6 \
    PYTHONUNBUFFERED=1

EXPOSE 8787

ENTRYPOINT []
CMD ["python", "-m", "uvicorn", "worker.app:app", "--host", "0.0.0.0", "--port", "8787"]
