# frontend

v2.0 do frontend do CortadorLive em **Vite + React + TypeScript + Tailwind + shadcn/ui**.
Angular legado foi removido.

## Setup

```bash
cd frontend
npm install
npm run dev   # http://localhost:4300
```

Backend FastAPI deve estar rodando em `http://localhost:8000`. Para apontar para outra URL, defina
`VITE_API_URL` em `.env.local`.
