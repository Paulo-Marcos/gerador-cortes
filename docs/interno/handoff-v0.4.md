# Hand-off para a v0.4 — CutCut

> Escrito em 22/09/2026, logo depois de publicar a **v0.3.0**. Destinado à sessão
> nova que vai tocar a v0.4 em `C:\DEV\gerador-cortes`. Este documento é um retrato
> desta data (regra do `docs/interno/`).

## 1. Onde o projeto está

- **v0.3.0 publicada**: tag `v0.3.0` no commit `c7bbf21`, release no GitHub com as
  notas do CHANGELOG, CI verde nos oito jobs (backend 3.11/3.13, frontend e renderer
  Node 20/24, gitleaks e o job Windows).
- **O repositório mudou de lugar**: de `C:\Users\paulo\OneDrive\DEV\gerador-cortes`
  para **`C:\DEV\gerador-cortes`**, fora do OneDrive. A pasta antiga ficou vazia e
  pode ser apagada; a pasta de contexto antiga em
  `~/.claude/projects/C--Users-paulo-OneDrive-DEV-gerador-cortes` (345 MB) foi
  **copiada** para `C--DEV-gerador-cortes` e pode ser removida quando a sessão
  anterior terminar.
- **A produção não mudou**: continua em `C:\PRD\gerador-cortes` e está **rodando**
  (backend 8000, frontend 4300, Remotion 3200, worker). **Nunca derrube nem reinicie
  a PROD sem pedir.** A PROD ainda **não** foi atualizada para a v0.3.0: quando for,
  confira que o backend passa a escutar em `127.0.0.1:8000` (D-745) e que um render
  roda até o fim.

## 2. O ambiente do DEV

| Serviço | Porta | Observação |
|---|---|---|
| Backend DEV | 8001 | `dev.ports.local.ps1` separa as portas das de PROD |
| Frontend DEV | 4301 | precisa de `frontend/.env.local` apontando para a 8001 |

A sessão anterior deixou os dois no ar; se tiverem caído, suba com `.\dev.ps1` (ou
`uvicorn` + `npm run dev` manualmente). **Encerre processos só pelo PID**, depois de
conferir a linha de comando — nunca pelo nome (`taskkill /IM` derruba a PROD).

O **`backend\.venv` foi recriado** depois da mudança de pasta (o venv antigo tinha o
caminho cravado nos executáveis). Portão completo já rodado no caminho novo: ruff,
import-linter (4 contratos) e **3510 testes passando**.

## 3. Como se trabalha aqui (o essencial)

Leia o **`AGENTS.md`** — é a fonte única. O que mais pega:

- **Travas de funcionalidade** (`.guia/locks/registry.yaml`): confira
  `python bin/check-lock.py check <arquivo>` **antes** de editar. Arquivo travado só
  muda com autorização explícita do dono e a marca `[unlock:<id>] motivo: …` no
  commit. **Criar arquivo novo também é travado** (`adicoes-exigem-autorizacao`).
- **Commit**: `<emoji> <tipo>(<D-NNN>): <descrição no imperativo>`. Desde a D-684 o
  hook `commit-msg` **e** o CI reprovam o que foge do formato.
- **Sempre commit com pathspec** (`git commit <arquivos> -F msg`), nunca `git add -A`:
  a árvore é compartilhada com outras sessões.
- **Guia Fluxo**: passe sempre o id explícito (`start D-NNN`, `finish D-NNN`), porque
  o `current-task.json` é compartilhado e deriva. Use `finish --no-commit` e commite
  à mão quando houver trava. O CLI está em
  `C:/Users/paulo/.claude/plugins/cache/guia-fluxo/guia/0.4.3/bin/guia.py`.
- **Portão de qualidade** (o mesmo do CI): backend `ruff check . && ruff format --check . && lint-imports && pytest`;
  frontend `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`.
- **Nunca declare verde pelo código de saída de um pipe** — grave a saída em arquivo.
- **Render e ffmpeg**: meça antes de mudar. O overlay é **ProRes 4444, obrigatório**.

## 4. A fila da v0.4

**Épicos abertos** (todos em backlog):

| Épico | Tema | Abertas |
|---|---|---|
| E-051 | Backend: inverter setas e quebrar ciclos (a dívida listada no import-linter) | 6 |
| E-052, E-053 | Backend: organizar por contexto em vez de por camada | 12 |
| E-054, E-055 | Domínio: regra única, linguagem ubíqua, funções-deus | 10 |
| E-056 | IA por chave de API (BYOK), para quem não tem assinatura | 1 |
| E-057, E-058 | Frontend: contrato gerado, feature-first e **casca única** | 13 |
| E-059 | Renderer: performance estrutural | 3 |

**Backlog solto que vale olhar cedo:** D-741 (o PATCH de layout grava o layout
inteiro e quebra a herança parcial — RN-10), D-743 (congelar os 29 `ALTER TABLE` do
boot numa migração), D-744 (seeds do boot que leem `os.getenv` e nunca acham nada),
D-742 (selo "experimental" nos botões de publicação assistida), D-736 (trocar de
canal sem reiniciar), D-669 e D-685 (opcionais estacionados).

### Ordem sugerida

1. **Dependências do backend** (PR #46, agrupado). O CI já mostrou que subir o
   FastAPI muda o contrato HTTP: o teste de drift do `openapi.json` reprova. É
   trabalho de regerar o contrato com `ATUALIZAR_OPENAPI=1 pytest tests/test_contrato_openapi_d664.py`
   e revisar o diff. Fazer isso **logo depois** da release dá semanas de uso antes
   da próxima.
2. **Triagem dos PRs abertos do Dependabot** (13 hoje). Os quatro agrupados (#37,
   #38, #39, #46) já vêm no formato de commit certo. Os isolados são versões
   maiores adiadas de propósito: React 19 (#40 — não subir `react-dom` sozinho),
   ESLint 10 (#41), Tailwind 4 (#44), TypeScript 7 (#43), typescript-eslint 8
   (#42, #45), websockets 17 (#48), google-genai (#50), pytest-cov (#47).
3. **E-058, casca única.** É a maior fonte de retrabalho hoje: cada ajuste de layout
   precisa ser feito em mais de um lugar.
4. **Backup da produção.** Os dados reais vivem em `C:\PRD` e **não estão em backup
   nenhum** desde que o DEV saiu do OneDrive. O código está no GitHub; os dados não.

## 5. Armadilhas já medidas (não repita)

- **`ruff format` transforma escapes `\u` em caractere literal** — use `chr(0xFE0F)`
  e afins quando o valor precisar ficar visível no código (D-668, D-684).
- **`lint-imports > NUL` sai com 1 no Windows** mesmo com tudo KEPT (impressão em
  cp1252). Rode com `PYTHONUTF8=1` ou grave em arquivo.
- **Mojibake não é pego por tsc/eslint/vitest** — quem pega é
  `tests/test_sem_mojibake_d668.py`.
- **`rmtree` no OneDrive falhava no meio**; no caminho novo isso não deve mais
  ocorrer, mas o espelho de skills (`bin/espelhar_skills.py`) trabalha arquivo a
  arquivo por causa disso.
- **`opencv-python` está travado na 4.x** (o 5.0 removeu os Haar cascades do
  detector de rosto). O Dependabot já tem regra de `ignore` para isso.
- **Não rode `npm run format`**: o CI não usa prettier e o comando reescreve o repo.
- **Worktree de frontend precisa de `frontend/.env.local`** antes de subir o Vite,
  senão ele fala com a instalação errada.

## 6. Preferências do dono

- Explique o que vem antes de fazer, e peça autorização a cada trava e a cada ação
  pública (PR, tag, release, configuração do repositório).
- Em render/ffmpeg: **pesquise e teste antes de mudar** ("já mexi 500 vezes nisso").
- Ações de "gerar com IA" disparam sozinhas no gesto do fluxo, sem modal.
- Relatos em português, diretos, com o porquê — e sem afirmar o que não foi medido.
