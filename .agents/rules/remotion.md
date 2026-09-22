---
trigger: model_decision
description: Utilizar quando for mexer no renderer (Remotion).
---

# Renderer (Remotion + worker Node)

O essencial deste escopo — vale com ou sem skill instalada:

- **Overlay é ProRes 4444, obrigatório.** VP9/.webm foi testado e não funciona neste pipeline: não proponha trocar.
- Filtergraph com fonte infinita (`color=`, `-loop 1`) precisa de limite (`trim=end`, `-shortest`); teste de grade confere duração e contagem de frames.
- A fila de render é de arquivos (`req_<id>.json` → `res_<id>.json`), não de banco. Protocolo em `backend/app/infrastructure/worker_queue.py`.
- Fontes: carregue só as do preset em uso e espere por elas antes de medir texto (`delayRender`).
- Render e ffmpeg: meça antes de mudar, com o baseline anotado. Mudança de dependência muda o fingerprint do bundle.

Skills, quando disponíveis:

- `remotion-best-practices` como principal;
- `react-best-practices` para o React das composições.

Não se aplicam: skills de Angular; `senior-frontend` e `ui-skills` (aqui não há interface de app).

Regras completas: `AGENTS.md`.
