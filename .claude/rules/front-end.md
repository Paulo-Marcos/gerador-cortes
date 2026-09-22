---
paths:
  - frontend/**
---

# Frontend (React + Vite + TanStack Query + Tailwind)

O essencial deste escopo — vale com ou sem skill instalada:

- É uma SPA Vite, **não** Next.js: nada de server components, rotas de arquivo ou scaffold de Next.
- Componente "burro" (JSX) separado de hook/serviço (lógica e I/O). O estado vem da API pelo TanStack Query.
- Fronteiras verificadas pelo ESLint: `components/` não importa `features/`; `hooks/` não importa `components/`; `lib/` e `types/` não sobem.
- Sem `console.*`. Mudança de tela se testa no navegador, não só no type-check.
- Portão: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`. **Não rode `npm run format`.**

Skills, quando disponíveis:

- `react-frontend-engineer` como principal (feita para React + Vite SPA);
- `ux-usability` ao desenhar ou revisar uma tela;
- `react-best-practices` só para desempenho (re-render, memo, bundle);
- `clean-code-review` e `clean-architecture-guardian` na revisão.

Não se aplicam: skills de Angular; `tdd-react` (é de outro projeto); a parte de Next.js/scaffold da `senior-frontend`.

Regras completas: `AGENTS.md`.
