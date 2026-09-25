# AGENTS.md

**Fonte única de instruções para agentes de IA neste repositório** — Claude, Codex, Cursor, Cline, Copilot e afins. Toda instrução operacional nova ou alterada entra **aqui**. O `CLAUDE.md` só importa este arquivo (`@AGENTS.md`): o Claude Code lê o `AGENTS.md` sozinho a partir da v2.1.277, e o import cobre as sessões em que a leitura direta não acontece, sem nunca duplicar o conteúdo.

> Regra de ouro para quem edita este arquivo: **confira no código antes de escrever.** Este documento já afirmou que a fila de render era SQLite e que o n8n era o caminho padrão da IA — nenhum dos dois era verdade.

## O projeto

**CutCut / CortadorLive** transforma lives do YouTube em cortes prontos para publicar: baixa a live → transcreve → a IA propõe cortes → o operador revisa e aprova → gera metadados e capa → renderiza → publica (YouTube, TikTok e Instagram) e gera shorts verticais. Roda localmente, com um banco e uma pasta por **canal**.

Documentação de domínio: [`docs/dominio/`](docs/dominio/) — [mapa de contextos](docs/dominio/mapa-de-contextos.md), [glossário](docs/dominio/glossario.md) e [catálogo de regras RN-01..RN-25](docs/dominio/regras-de-negocio.md). Ao tocar numa regra catalogada, cite a RN na docstring.

## Como rodar

```powershell
# Windows PowerShell — sobe backend, frontend, Remotion Studio e o worker de render
.\dev.ps1
```

| Serviço | Porta padrão |
|---|---|
| Backend (FastAPI; documentação em `/docs`) | 8000 |
| Frontend (React + Vite) | 4300 |
| Remotion Studio | 3200 (fora da faixa 3000-3100 que o renderer usa para servir o bundle) |
| Worker de render (`video-renderer/native_worker.js`) | processo em segundo plano |

Rodar cada parte isolada:

```bash
cd backend && python -m uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
cd video-renderer && npm install && npm run dev
```

A instalação completa está em [`docs/SETUP.md`](docs/SETUP.md).

## Arquitetura

### Backend (FastAPI, Python 3.11+)

```
routers/ (HTTP)  →  services/ (orquestração)  →  domain/ (regras puras)
                                              ↘  infrastructure/ (clientes externos)
SQLite via SQLAlchemy assíncrono (WAL), um banco por canal
```

- **`domain/` é puro** e é onde moram as **regras de negócio** (não "utilitários"): sem FastAPI, sem SQLAlchemy, sem HTTP, sem cliente externo, sem importar `models`.
- **Routers** só convertem HTTP ↔ serviço. **Services** orquestram. **Infrastructure** fala com o mundo (CLIs de IA, APIs do Google, ffmpeg, a fila do worker).
- As fronteiras são **verificadas por máquina**: os contratos do import-linter em `backend/pyproject.toml` (`[tool.importlinter]`), rodados pelo CI e por um teste do pytest. A dívida conhecida está listada em `ignore_imports`, cada item com a demanda que vai quitá-la; import novo na direção errada quebra o build.
- I/O é assíncrono. Operações longas (download, transcrição, render) rodam como tarefas em segundo plano; o progresso chega ao frontend por WebSocket.

### Inteligência artificial

Dois provedores, ambos pela **assinatura** do operador (sem chave de API): `claude` (Claude CLI, `infrastructure/claude_cli_client.py`) e `gemini` (Antigravity CLI, `agy -p`, `infrastructure/antigravity_cli_client.py`). O tipo `ProviderIA` está em `app/provider_ia.py`. Há também o **modo manual** (o prompt é copiado e a resposta colada, `domain/compartilhado/manual_prompt.py`) e o cliente da **API do Gemini** (`infrastructure/gemini_client.py`), usado por cenas, desvios e thumbnails.

As skills editoriais (análise, metadados, capa etc.) são **por canal, no banco**, editáveis pela tela de Canais — não em `.claude/skills/`.

**O n8n saiu do código** (D-344). A pasta `n8n-workflows/` é legado e não é usada.

### Frontend (React + Vite)

Páginas em `frontend/src/features/` (rotas em `frontend/src/routes.tsx`). O estado vem das respostas da API (TanStack Query). Fronteiras entre pastas verificadas pelo ESLint (`frontend/.eslintrc.cjs`): `components/` não importa `features/`; `hooks/` não importa `components/`; `lib/` e `types/` não sobem para camada nenhuma. A dívida conhecida está em `excludedFiles`.

### Renderer (Remotion + Node)

`video-renderer/` é um projeto Remotion separado. **A fila de render é de arquivos, não de banco:** o backend grava `req_<id>.json` na pasta da fila e espera o `res_<id>.json` que o `native_worker.js` escreve (protocolo em `backend/app/infrastructure/worker_queue.py`). O worker grava as respostas de forma atômica e responde uma vez por job.

- **Overlay do Remotion é ProRes 4444, obrigatório.** VP9/.webm foi testado e não funciona neste pipeline. Não proponha trocar.
- **Filtergraph com fonte infinita** (`color=`, `-loop 1`) precisa de limite (`trim=end`, `-shortest` ou equivalente). Teste de grade confere duração e contagem de frames.

### Contrato HTTP

`backend/openapi.json` é a especificação versionada da API. O teste `tests/test_contrato_openapi_d664.py` compara com a gerada e falha dizendo quais rotas mudaram. Mudança intencional: `ATUALIZAR_OPENAPI=1 pytest tests/test_contrato_openapi_d664.py`.

### Modelo de dados e ciclos de vida

Modelos em `backend/app/models.py`; tipos espelhados em `frontend/src/types/models.ts`.

```
Projeto: pendente → baixando → transcrevendo → pronto → analisando → analisado   (| erro)
Corte:   proposto ⇄ aprovado → processado   (rejeitado é legado; "Rejeitar" exclui o corte)
```

As transições têm dono no domínio: `domain/projeto/ciclo_projeto.py` e `domain/corte/ciclo_corte.py` (RN-01, RN-04). O PATCH do corte recusa com 400 uma transição fora da tabela. Os caminhos em segundo plano mudam status por `services/ciclo_de_vida.py`, que registra aviso — em vez de exceção — para o que a tabela não prevê. Mudar um enum de status exige migração.

## Configuração

- **Segredos** ficam no `backend/.env` (lido por `app/config.py`, pydantic-settings).
- **Configuração e customização** ficam **no banco, por canal, editáveis na tela** — não em arquivo. A identidade do canal (handle, nome, crédito, canal-fonte das lives), os ajustes e as skills editoriais vivem no `settings.db`, por canal (D-191); o `channel.yaml` só é lido como reserva para canal ainda não migrado. Acesso por `channels.identidade_do_canal_ativo()`. Mapa completo em [ADR-0012](docs/adr/0012-onde-vive-cada-configuracao.md).
- `instance/` tem layout vigiado: um arquivo solto na raiz dele trava o boot. Artefato global novo ali precisa entrar na lista de reservados.
- **Cascata de layout é PARCIAL** (RN-10): chave ausente é o mecanismo de herança (global → projeto → corte). Normalize na **leitura**; nunca materialize os padrões ao gravar.

## Regras de produto

- **Ação "gerar com IA" dispara sozinha no gesto do fluxo**, sem modal de confirmação, e nunca sobrescreve texto que já foi gerado (a capa é a exceção).
- Vocabulário do domínio (`Projeto`, `Corte`, `Metadado`, `Short`, `Ingestão`, `Análise`) é o mesmo em código, banco e tela — não invente sinônimo. Termos que se confundem estão no [glossário](docs/dominio/glossario.md).

## Skills por pasta

As rules em `.claude/rules/` (Claude Code) e `.agents/rules/` (Antigravity) entram pelo caminho do arquivo tocado. Cada uma traz o essencial do escopo escrito nela — vale mesmo sem skill instalada — e as skills preferidas, quando disponíveis:

| Pasta | Principal | Também |
|---|---|---|
| `backend/**` | `clean-architecture-guardian` (camadas), `clean-code-review` (legibilidade) | `domain-driven-design`, só o estratégico |
| `frontend/**` | `react-frontend-engineer` (React + Vite SPA) | `ux-usability` (telas), `react-best-practices` (desempenho) |
| `video-renderer/**` | `remotion-best-practices` | `react-best-practices` |

**Não se aplicam:** skills de Angular (o frontend é React), a parte de Next.js da `senior-frontend`, e as de outros projetos (`tdd-react`, `tdd-dotnet`, `ddd-implementation`, `csharp-craft`, `ef-core-data-architect`).

---

## Protocolo de alteração (travas de funcionalidade)

> Vale para qualquer agente.

### Antes de editar QUALQUER arquivo

1. Veja se ele aparece em [`.guia/locks/registry.yaml`](.guia/locks/registry.yaml) (`python bin/check-lock.py check <arquivo>`).
2. Se aparecer, **o arquivo está travado**: pode ler, mas não pode editar, apagar, renomear, mover nem recriar em outro caminho.
3. Antes de pedir desbloqueio, explique: o `id` da trava, o que ela protege, por que a mudança toca nela, o impacto esperado, o risco de regressão e a alternativa sem mexer no arquivo.
4. **Peça autorização explícita ao desenvolvedor.** Não decida sozinho e não contorne (renomear, refazer noutro lugar, dividir em vários).
5. Criar arquivo novo também é trava (`adicoes-exigem-autorizacao`).

As travas protegem **funcionalidades homologadas**, não contextos de arquitetura: um arquivo pode estar em várias, um contexto inteiro pode não ter nenhuma.

### Como o desbloqueio funciona

O commit leva **uma marca por trava que casa** com os arquivos alterados:

```
[unlock:<feature-id>] motivo: <razão curta>
```

O hook `.githooks/commit-msg` e o workflow `.github/workflows/lock-check.yml` validam. Instale o hook uma vez por clone e confirme que ficou ativo — uma IDE pode revertê-lo em silêncio (D-261):

```powershell
git config core.hooksPath .githooks
git config --get core.hooksPath   # deve responder .githooks
```

---

## Padrão de commit (Conventional Commits + gitmoji)

Mensagem em português, no imperativo, com o emoji **antes** do tipo (D-091):

```
<emoji> <tipo>(<D-NNN>): <descrição imperativa, minúscula, sem ponto final>

[corpo: o PORQUÊ, não o "o quê"]

[unlock:<feature-id>] motivo: <razão>   ← só quando tocar arquivo travado
Co-Authored-By: <nome> <email>           ← em commit assistido por IA
```

| Tipo | Emoji | Quando |
|---|---|---|
| `feat` | ✨ | capacidade nova |
| `fix` | 🐛 | correção de defeito ou regressão |
| `refactor` | ♻️ | reestrutura sem mudar comportamento |
| `chore` | 🧹 | manutenção, dependências, configuração |
| `docs` | 📝 | documentação |
| `style` | 🎨 | formatação, sem lógica |
| `test` | ✅ | testes |
| `perf` | ⚡ | desempenho |
| `ci` | 👷 | pipeline de CI |
| `merge` | 🔀 | merge de branch ou worktree |

Escopo `(D-NNN)` sempre que houver tarefa (`(E-NNN)` para épico). **Um commit por funcionalidade**: stage misturado se divide antes de commitar.

---

## Execução concorrente (worktree e árvore compartilhada)

- **Um worktree por frente concorrente**, ou rode uma de cada vez. Frentes na mesma árvore contaminam os commits umas das outras.
- **Commit com pathspec**: `git commit <arquivos> -F msg`. Nunca `git add -A` nem `git commit` sem caminho numa árvore compartilhada. Confira `git diff --cached --name-only` antes. **Exceção que o pathspec não protege:** se o mesmo arquivo tem hunks de outra sessão, o pathspec os leva junto.
- **Nunca `git stash`** para medir linha de base numa árvore compartilhada — o `stash@{0}` muda de dono. Use `git worktree add` ou `git diff HEAD -- <arquivo>`.
- Depois de resolver conflito de rebase, rode `git diff main -- <arquivo> | grep "^-"` antes do `--continue`: "manter os dois lados" já comeu corpo de função.
- **Worktree de frontend precisa de `frontend/.env.local` com `VITE_API_URL`** antes de subir o Vite. Sem ele, a URL da API cai no padrão e o frontend fala com o backend de **outra** instância.
- **Guia Fluxo:** passe sempre o id explícito (`finish D-NNN`, `ready D-NNN`) — o `current-task.json` é compartilhado e deriva entre sessões. O `finish` padrão gera mensagem no formato antigo; com arquivo travado, use `--no-commit` e faça o commit à mão com as marcas.
- Tarefa que **reescreve histórico** (`git filter-repo` e afins) roda sozinha, com o backend e as outras sessões parados.

---

## Portão de qualidade (o mesmo do CI)

Antes de declarar pronto, rode exatamente o que o CI roda:

```bash
# backend
ruff check . && ruff format --check . && lint-imports && pytest
# frontend
npm run lint && npx tsc --noEmit && npx vitest run && npm run build
```

- **Não rode `npm run format`** (prettier `--write`): o CI não usa prettier e o comando reescreve o repositório inteiro.
- **Nunca declare verde pelo código de saída de um pipe** (`cmd | tail; echo $?` mostra o código do `tail`). Grave a saída num arquivo e leia.
- No Windows, `lint-imports > NUL` sai com 1 mesmo com todos os contratos KEPT (a impressão do `rich` em cp1252). Rode com `PYTHONUTF8=1` ou grave a saída em arquivo.
- **Confira o encoding depois de uma edição feita por agente**: tsc, eslint e vitest não pegam mojibake. O teste `tests/test_sem_mojibake_d668.py` pega — e, por ser pesado, fica fora do ciclo rápido: rode-o explicitamente (`pytest tests/test_sem_mojibake_d668.py`).

### Níveis de teste do backend (D-751)

O portão acima é o **suíte completo**: obrigatório antes de declarar pronto e o que o CI roda sempre. No dia a dia há níveis mais rápidos. Tempos medidos em 23-24/09/2026 nesta máquina (variam com a carga):

| Momento | Comando (em `backend/`) | Custo medido |
|---|---|---|
| Enquanto edita | `pytest --testmon` | 2 s sem mudança; 13 s mudando `hms_to_seg` (132 testes) |
| Antes de cada commit | `pytest -m "not integration" -n 6` | ~50 s (3.474 testes; ~2 min em série) |
| Ao fechar uma demanda e antes do push | `pytest` (em série) | ~5 min (3.516 testes) |

- **`integration` marca o teste pesado pelo recurso que ele usa**, não pelo nome: processo externo real (ffmpeg, worker Node, OpenCV), varredura do repositório ou codificação de imagem. Teste novo com esse perfil nasce marcado.
- **O testmon só enxerga código Python executado.** Mudou `pyproject.toml` (contratos), `openapi.json`, script Node ou JSON de fixture: rode o suíte completo.
- A primeira `pytest --testmon` constrói a base local (`.testmondata`, fora do git) rodando tudo, em cerca de 7 min. `--testmon` não funciona com `-p no:cacheprovider`: o plugin lê opções do cache do pytest.
- **`-n 6` (pytest-xdist) só no ciclo antes do commit.** Com 6 processos, 4 rodadas seguidas passaram inteiras; com 4 ou 12 apareceram falhas. Dois testes conhecidos podem falhar por ambiente, não por defeito — se um deles falhar, rode de novo em série: `test_os_dois_robos_nunca_dividem_a_porta` (consulta portas e processos da máquina; D-737) e `test_o_app_continua_respondendo_enquanto_o_disco_apaga` (sensível à disputa de CPU; D-752). Falha em qualquer outro teste é real. O suíte completo e o CI seguem em série: os pesados não foram medidos em paralelo.

## Princípios de engenharia (com pragmatismo)

É uma aplicação pequena, de um mantenedor. Aplique o que faz sentido para o tamanho dela; **não invente abstração para o futuro**.

- **Testes:** código novo em `domain/` ou `services/` nasce com pelo menos um teste do caminho feliz. Teste que quebra = tarefa não pronta.
- **Clean Code:** nomes que dizem a intenção (verbo para função, substantivo para entidade); funções pequenas; comentário explica o **porquê**, nunca o "o quê"; sem código morto, TODO genérico ou `print`/`console.log` esquecido.
- **Não-regressão:** não "limpe" código vizinho ao que precisa mudar (refactor de brinde é outra tarefa). Em mudança de tela, teste no navegador.
- **Processos:** nunca mate processo **pelo nome** (`taskkill /IM ffmpeg.exe` derruba o de outras instâncias) — só pelo PID. Todo subprocesso tem `timeout`.
- **Em caso de dúvida, pergunte antes de editar.** Uma pergunta custa pouco; uma regressão silenciosa em algo estável custa caro.
