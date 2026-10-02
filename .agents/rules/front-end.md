---
trigger: model_decision
description: Utilizar quando for mexer no frontend (React + Vite).
---

# Frontend (React + Vite + TanStack Query + Tailwind)

O essencial deste escopo — vale com ou sem skill instalada:

- É uma SPA Vite, **não** Next.js: nada de server components, rotas de arquivo ou scaffold de Next.
- Componente "burro" (JSX) separado de hook/serviço (lógica e I/O). O estado vem da API pelo TanStack Query.
- Fronteiras verificadas pelo ESLint: `components/` não importa `features/`; `hooks/` não importa `components/`; `lib/` e `types/` não sobem.
- Sem `console.*`. Mudança de tela se testa no navegador, não só no type-check.
- **Toda mudança vem com teste** (vitest em ambiente node, sem DOM: componente se testa pelo HTML de `renderToStaticMarkup`): cada item do pedido — tela, componente, hook, refatoração — tem o teste que o cobre. O navegador confere; o teste fixa.
- Correção de defeito começa pelo teste que reproduz o bug: ele falha antes da correção e passa depois (antes/depois no `ready --validation`). Sem refactor de carona nem teste enfraquecido.
- Portão: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`. **Não rode `npm run format`.**

Skills, quando disponíveis:

- `react-frontend-engineer` como principal (feita para React + Vite SPA);
- `ux-usability` ao desenhar ou revisar uma tela;
- `react-best-practices` só para desempenho (re-render, memo, bundle);
- `clean-code-review` e `clean-architecture-guardian` na revisão.

Não se aplicam: skills de Angular; `tdd-react` (é de outro projeto); a parte de Next.js/scaffold da `senior-frontend`.

Regras completas: `AGENTS.md`.
