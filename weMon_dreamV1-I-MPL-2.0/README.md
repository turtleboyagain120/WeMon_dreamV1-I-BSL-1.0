# weMon_dreamV1-I-MPL-2.0

Ultra-fast semantic deep-indexed search engine (Node.js + Fastify).

## Run locally (Windows PowerShell)

```powershell
cd C:\Users\turtl\Desktop\weMon_dreamV1-I-MPL-2.0
pnpm install
pnpm dev
```


## Docker

```bash
docker compose up --build
```

## Key endpoints

- `POST /v1/index` ingest corpus text
- `POST /v1/search` query
- `GET /v1/health`

