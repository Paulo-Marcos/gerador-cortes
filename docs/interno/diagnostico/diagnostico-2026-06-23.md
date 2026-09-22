# Diagnóstico do projeto — gerador-cortes (CortadorLive) · 2026-06-23

## Resumo executivo
O projeto está estruturalmente saudável e bem right-sized para um pipeline pessoal single-user: domínio puro isolado, infraestrutura bem separada por cliente (n8n, Gemini, Claude CLI, FFmpeg), frontend com separação UI↔dados (React Query + `lib/api.ts` + hooks) e código recente de craft acima da média (ex.: `renderEtapas.ts`, `numeroFit.ts`). Os débitos de maior retorno são transversais, não de stack: **(1)** ausência de CI rodando os ~91 testes existentes; **(2)** uma inversão de dependência `service → router` e routers "gordos" com regra de negócio embutida (sobretudo `cortes.py`, 1526 linhas); **(3)** documentação-âncora (`CLAUDE.md`) desatualizada em 3 pontos factuais + zero ADRs registrando decisões fortes já tomadas; e **(4)** higiene de skills/commits (rules apontando para Angular inexistente, typo em `@remotion-best-pratices`, histórico sem gitmoji). Nenhum achado indica over-engineering nem escolha de tecnologia errada.

## Cobertura das skills
| Skill planejada | Invocada? | Status | Nº de achados |
|---|---|---|---|
| skill-router | sim | ok | 7 |
| clean-architecture-guardian | sim | ok | 6 |
| clean-code-review | sim | ok | 7 (1 elogio) |
| open-source-readiness | sim | ok | 8 |
| proposal-architect | sim | ok | 6 |
| conventional-commit-gitmoji | sim | ok | 6 |

## Prioridades (severidades ALTAS / críticas, agrupadas por tema)
| # | severidade | tema | achado | skill | arquivo:linha | próximo passo |
|---|---|---|---|---|---|---|
| 1 | crítica | fronteira de camada | `ExportService` importa um handler do router (`from app.routers.cortes import _executar_deteccao_segmentos`) — seta de dependência invertida (service → presentation), ciclo de camadas mascarado por import lazy | clean-architecture-guardian | backend/app/services/export.py:788 | → clean-architecture-guardian: mover a função para `services/deteccao_segmentos.py`; router passa a chamá-la de lá |
| 2 | alta | prontidão CI | Não há CI que rode testes a cada PR/push; único workflow é `lock-check.yml`. ~68 testes backend + 23 frontend nunca rodam | open-source-readiness | .github/workflows/ (só lock-check.yml) | → open-source-readiness: andaimar `ci.yml` (pytest + vitest + tsc + build) |
| 3 | alta | router gordo / SRP | `cortes.py` (1526 linhas) com lógica de negócio no handler: `atualizar_corte` (~95 linhas) faz normalização de cenas, invalidação, validação e commit | clean-architecture-guardian | backend/app/routers/cortes.py:490-584 | → clean-architecture-guardian: extrair `CorteService.atualizar(...)`; router fino |
| 4 | alta | router gordo / camada | Helpers puros de domínio/serialização vivem no router (`_corte_to_dict`, `_normalizar_cenas_remotion_payload`, `_tem_colapso_de_tempos_das_cenas`, etc.) | clean-architecture-guardian | backend/app/routers/cortes.py:176-310 | → clean-architecture-guardian: mover para `domain/` (mapper/validator) |
| 5 | alta | config de skills | `front-end.md` e `remotion.md` mandam usar `@angular-best-practices`/`@angular-ui-patterns`, mas o frontend é React+Vite — skills inaplicáveis arrastadas | skill-router | .claude/rules/front-end.md:8-9; .claude/rules/remotion.md:8-9 | → skill-router: remover as linhas `@angular-*` das rules |
| 6 | alta | config de skills | Referência quebrada por typo: `@remotion-best-pratices` (falta o "c") nunca resolve | skill-router | .claude/rules/remotion.md:13 | → skill-router: corrigir para `@remotion-best-practices` |
| 7 | alta | log esquecido | `print(...)` para logging em produção em módulo que já tem `logger` (9 ocorrências); contraria CLAUDE.md "sem print esquecido" | clean-code-review | backend/app/services/remotion_render.py:45-141 | → clean-code-review: trocar por `logger.info/warning/error` |
| 8 | alta | função longa | Prompt de thumbnail é literal de ~60 linhas embutido na função (mistura regra editorial + orquestração) | clean-code-review | backend/app/services/claude_ia.py:604-661 | → clean-code-review: Extract Function/constante de módulo |
| 9 | alta | padrão de commit | Nenhum commit usa gitmoji; tipo não-canônico `feature` (vs `feat`); alguns commits misturam assuntos (ex.: `8a415f1`, `e1c60c5`, `2660f96`) | conventional-commit-gitmoji | git log | → conventional-commit-gitmoji: decidir e registrar a regra (estender template do `ai.ps1`) |

> Nota: o achado #9 mistura desvio real (commits multi-assunto) com tensão *deliberada* entre o padrão da skill (`feat`, emoji) e a convenção local do repo (`feature(D-xxx)` via `ai.ps1`). Os itens "gitmoji/feat" só são "problema" se a divergência não for intencional — a recomendação é **decidir e registrar**, não corrigir cegamente.

## Achados por skill

### skill-router
- status: ok
- skill_invocada: sim
- resumo: A configuração cobre os quatro escopos, mas as regras de front-end/Remotion arrastam três skills de Angular (stack inexistente no projeto) e têm uma referência quebrada por typo; nenhuma skill usa `paths:` para auto-ativação por diretório, deixando o roteamento inteiramente dependente de `description`.

| # | severidade | descrição | arquivo:linha | fonte/regra | próximo passo |
|---|---|---|---|---|---|
| 1 | alta | `front-end.md` e `remotion.md` mandam usar `@angular-best-practices` e `@angular-ui-patterns`, mas o frontend é React 18 + Vite + TS. Skills Angular nunca devem ativar aqui → ruído e orientação inaplicável. | `.claude/rules/front-end.md:8-9`; `.claude/rules/remotion.md:8-9` | skill-router: gatilho largo/lacuna | Remover as 2 linhas `@angular-*` de ambas as rules; manter `@react-best-practices`, `@senior-frontend`, `@ui-skills`. |
| 2 | alta | Referência quebrada por typo: a rule chama `@remotion-best-pratices` mas o skill é `remotion-best-practices`. O alias nunca resolve. | `.claude/rules/remotion.md:13` | skill-router: gatilho fraco | Corrigir para `@remotion-best-practices`. |
| 3 | média | Nenhuma das 16 skills do projeto declara `paths:`. Escopos fisicamente separados (`backend/`, `frontend/`, `video-renderer/`) mas ativação 100% por `description`. | `.claude/skills/*/SKILL.md` (frontmatter) | skill-router: alavanca `paths:` não usada | Avaliar `paths:` por escopo (aplicar só com confirmação/diff). |
| 4 | média | `react-best-practices` se autodescreve "React and Next.js"; o projeto usa Vite, não Next. Gatilho mais largo que o escopo. | `.claude/skills/react-best-practices/SKILL.md:3` | skill-router: gatilho largo | Manter a skill; registrar que recomendações Next-específicas não se aplicam. |
| 5 | baixa | Backend pequeno/pessoal puxa `@domain-driven-design` em toda edição — risco "largo demais" vs. CLAUDE.md ("não invente abstrações"). | `.claude/rules/backend.md:8` | skill-router: colisão skill × convenção | Estreitar a rule para "DDD pragmático". |
| 6 | baixa | Experts de domínio (`cortador/cenas/metadados/thumbnail/trechos-expert`) com `description` por tarefa, sem termos de código/rota → disparo depende do usuário nomear a tarefa. | `.claude/skills/*-expert/SKILL.md` | skill-router: gatilho fraco | Enriquecer `description` com termos de domínio/arquivos (via skill-creator). |
| 7 | baixa | Sem `skillOverrides` em `settings.local.json`; listing expõe muitas skills built-in/plugin "pushy". Sem controle de ruído configurado. | `.claude/settings.local.json` | skill-router: cobertura | Opcional: silenciar famílias irrelevantes (`angular*`, `expo:*`, `figma:*`) com confirmação. |

### clean-architecture-guardian
- status: ok
- skill_invocada: sim
- resumo: A direção de dependência macro está respeitada (domínio puro; nenhum router instancia cliente de infra; frontend com `lib/api.ts` e hooks dedicados). Os achados se concentram em routers "gordos" com lógica de negócio embutida e uma inversão de seta service→router.

| # | severidade | descrição | arquivo:linha | fonte/regra | próximo passo |
|---|---|---|---|---|---|
| 1 | 🔴 Crítico | `ExportService` importa um handler do router (`from app.routers.cortes import _executar_deteccao_segmentos`) dentro do método — seta de dependência invertida (service → presentation); import lazy mascara ciclo de camadas. | backend/app/services/export.py:788 | DIP / direção de camada | Mover `_executar_deteccao_segmentos` para `services/deteccao_segmentos.py`; router chama de lá. Esforço: baixo. |
| 2 | 🟠 Alto | `cortes.py` (1526 linhas) com regra no handler: `atualizar_corte` (~95 linhas) faz normalização de cenas, invalidação de `cenas_validadas`, prefixo de leitura, validação de colapso e commit. | backend/app/routers/cortes.py:490-584 | SRP / "Routers só convertem HTTP ↔ serviço" | Extrair `CorteService.atualizar(corte_id, dados)`; router fino. Esforço: médio. |
| 3 | 🟠 Alto | Helpers de domínio/serialização no router: `_corte_to_dict`, `_normalizar_cenas_remotion_payload`, `_tem_colapso_de_tempos_das_cenas`, `_extrair_cenas_remotion`, `_primeiro_numero_valido`. | backend/app/routers/cortes.py:176-310 | direção de camada / SRP | Mover funções puras para `domain/` (ex.: `domain/corte_mapper.py`). Esforço: médio. |
| 4 | 🟡 Médio | `print("[DB-DEBUG] ...")` no caminho de gravação do layout, com SELECT pós-commit só para logar. | backend/app/routers/cortes.py:551-578 | Clean Code (delegar a clean-code-review) | Remover prints/SELECT ou trocar por logging condicional. Esforço: baixo. |
| 5 | 🟡 Médio | Routers acessam DB/models diretamente em larga escala (179 ocorrências). Aceitável em CRUD trivial; vaza onde há regra (achados 2-3). | backend/app/routers/*.py | direção de camada (pragmático) | Extrair para `services/` só handlers que combinam I/O + regra; sem repositório genérico especulativo. Esforço: médio. |
| 6 | 🔵 Sugestão | Frontend: 2 `fetch()` crus em componentes (waveform/cena) desviam do "componente burro separado de serviço". | frontend/src/features/editor/fase1/TimelinePanel.tsx:338; .../fase2/SceneTimeline.tsx:427 | separação UI/serviço | Encapsular em helper de `lib/api.ts`/hook. Esforço: baixo. |

### clean-code-review
- status: ok
- skill_invocada: sim
- resumo: O código recente é de craft acima da média (nomes intencionais, comentários de "porquê", domínio puro extraído em `renderEtapas.ts`/`numeroFit.ts`). Os achados são pontuais: `print` esquecidos no backend, tipos de fase duplicados entre frontend, e a função gigante de prompt em `claude_ia.py`.

| # | severidade | descrição | arquivo:linha | fonte/regra | próximo passo |
|---|---|---|---|---|---|
| 1 | 🟠 Importante | `print(...)` para logging em produção num módulo que já tem `logger`. Mistura dois mecanismos; 9 ocorrências; proibido em CLAUDE.md. | backend/app/services/remotion_render.py:45,70,73,84,95,100,109,113,138,141 | Clean Code Cap. 7 + CLAUDE.md | Trocar `print(..., flush=True)` por `logger.*`. Risco: seguro. |
| 2 | 🟠 Importante | `prompt = (...)` da thumbnail é literal de ~60 linhas embutido na função (regra editorial + orquestração juntas). | backend/app/services/claude_ia.py:604-661 | Clean Code Cap. 3 · Fowler: Long Method → Extract Function | Extrair `_DIRECAO_THUMBNAIL` ou `_montar_prompt_thumbnail(...)`. Risco: seguro. |
| 3 | 🟡 Nit | Tipo de fase duplicado/divergente: `RenderStartFrom` (useEditor.ts) e `FaseRender` (renderEtapas.ts) descrevem o mesmo domínio com membros sobrepostos; `pararEm` re-declara union em vez de reusar `FaseRender`. | frontend/src/hooks/useEditor.ts:13,293 | Fowler: Duplicated Code / DRY | Reusar `FaseRender` em `pararEm`. Risco: seguro. |
| 4 | 🟡 Nit | `_formatar_transcricao_corte` e `_formatar_segmentos`/`_formatar_chunk_para_prompt` repetem o padrão de formatação; `_formatar_transcricao_corte` aparenta ser código morto. | backend/app/services/claude_ia.py:470-479 | Fowler: Dead Code / Duplicated Code | Confirmar uso; se morto, remover; senão extrair helper. Risco: arriscado (verificar antes). |
| 5 | 🟡 Nit | `import` redundante no meio da função (`fatiar_transcricao` já importado no topo); idem em `_granularizar:204`. | backend/app/services/claude_ia.py:143 | Clean Code Cap. 3 · PEP 8 | Remover imports locais redundantes. Risco: seguro. |
| 6 | 💡 Sugestão | `sincronizar_tarefas_concluidas` engole `Exception` por arquivo só com `print`, mascarando bug recorrente sem rastro. | backend/app/services/remotion_render.py:140-141 | Clean Code Cap. 7 | Usar `logger.exception(...)`. Risco: seguro. |
| 7 | 🌟 Elogio | `renderEtapas.ts` exemplar: domínio puro sem React/I/O, funções pequenas de responsabilidade única, nomes que revelam intenção. Idem `numeroFit.ts`. | frontend/src/features/post-production/renderEtapas.ts · video-renderer/src/cenas-v2/_shared/numeroFit.ts | Clean Code Cap. 2-3 | Manter como referência de separação UI × lógica. |

### open-source-readiness
- status: ok
- skill_invocada: sim
- resumo: Repo full-stack (Python + Node/React + Remotion) com base de docs e segurança acima da média (README orientado ao problema, AGENTS.md, LICENSE, .env.example sem segredos, 68 testes backend + 23 frontend), mas SEM o pilar 2 do "mínimo": não há CI rodando testes a cada PR/push — só um `lock-check.yml`. CHANGELOG e deploy padronizado também faltam.

| # | severidade | descrição | arquivo:linha | fonte/regra | próximo passo |
|---|---|---|---|---|---|
| 1 | 🔴 | Pilar 2 — sem CI que rode testes a cada PR/push. Único workflow (`lock-check.yml`) checa travas, não roda `pytest`/`vitest`/`tsc`. 68 testes backend + 23 frontend nunca rodam. | `.github/workflows/` | Akita pilar 2 | Andaimar `ci.yml` (backend pytest, frontend lint+test+build, video-renderer lint). |
| 2 | 🟡 | Pilar 2 — sem `release.yml` por tag `v*`; sem audit de dependências (`pip-audit`/`npm audit`) nem `ruff` no CI. | `.github/workflows/` | Akita pilar 2 | Andaimar `release.yml` + steps de audit/format. |
| 3 | 🟡 | Pilar 3 — `docs/CHANGELOG.md` é narrativa arquitetural, sem seções de versão/semver/Unreleased (Keep a Changelog). | `docs/CHANGELOG.md:1` | Akita pilar 3 | Criar `CHANGELOG.md` na raiz no formato Keep a Changelog. |
| 4 | 🟡 | Pilar 3 — sem `bin/deploy` previsível; `bin/` só tem `check-lock.py`. | `bin/` | Akita pilar 3 | Andaimar `bin/deploy` + `deploy.env.example`. |
| 5 | 🟡 | Pilar 1 — instalação não é "1 comando": README exige passos manuais no n8n. | `README.md:33-39` | Akita pilar 1 | Considerar `docker compose` que pré-importe workflows ou `bin/setup`; documentar como aceitável p/ app pessoal. |
| 6 | 🔵 | Transversal — sem `llms.txt`. AGENTS.md já existe e é robusto. | raiz (ausente) | Akita transversal | Opcional: gerar `llms.txt`. |
| 7 | 🔵 | Pilar 3 — sem `CONTRIBUTING.md`. | raiz (ausente) | Akita pilar 3 | Opcional p/ projeto pessoal. |
| 8 | 🔵 | Higiene — `.gitignore` ignora `*.json` globalmente com muitas exceções `!...`; `.tmp-*.bak` e `tsc.log` no working tree. | `.gitignore:44,62-68`; raiz | Clean repo | Revisar regra `*.json`; remover `.tmp-*.bak`/`tsc.log` locais. |

**Já está bom:** segurança (nenhum `.env`/segredo versionado; `.env.example` presentes), pilar 1 documentado (`docker compose` + `dev.ps1`), README abre pelo problema, testes substanciais (68/23), AGENTS.md + CLAUDE.md robustos, LICENSE presente.

### proposal-architect
- status: ok
- skill_invocada: sim
- resumo: A stack (FastAPI + SQLite async + React/Vite + Remotion + worker Node nativo) continua bem right-sized para um pipeline pessoal single-user; os achados são lacunas de registro arquitetural (zero ADRs) e desalinhamentos factuais entre o CLAUDE.md e a estrutura real, não erros de stack.

| # | severidade | descrição | arquivo:linha | fonte/regra | próximo passo |
|---|---|---|---|---|---|
| 1 | média | Decisão não registrada: IA tem **três** provedores coexistindo (n8n, Claude CLI, Gemini) sem ADR explicando o porquê de cada um nem estratégia de migração. | backend/app/infrastructure/{n8n_client,claude_cli_client,gemini_client}.py; docs/feature-F-038-geracao-via-claude.md | registro de decisão | ADR "Estratégia de provedores de IA". |
| 2 | média | Desalinhamento: CLAUDE.md afirma "AI-heavy work delegated to n8n — not done inline", mas cenas/desvios/shorts/thumbnail chamam Gemini direto e há geração via Claude CLI. | CLAUDE.md (Layered Backend) vs backend/app/services/{cenas_remotion,desvios,shorts,thumbnail}.py | veracidade da doc-âncora | Corrigir descrição no CLAUDE.md (3 caminhos de IA). |
| 3 | média | Desalinhamento: CLAUDE.md diz "Render jobs queued in SQLite", mas a fila é **filesystem** (`fila_remotion/req_*.json`→`res_*.json`, IPC via watchfiles); sem tabela de job em `models.py`. | backend/app/services/pipeline_render.py:847; backend/app/infrastructure/worker_queue.py:1; backend/app/models.py | veracidade + registro | ADR "IPC backend↔worker via fila de arquivos" + corrigir CLAUDE.md. |
| 4 | baixa | Não existe `docs/adr/`. Decisões fortes (SQLite WAL single-writer, worker Node externo, FFmpeg/QSV+ProRes, overlay ProRes 4444) sem registro versionável. | docs/ | registro de decisão | Criar `docs/adr/` e semear ADRs retroativos. |
| 5 | baixa | Under-engineering medido: SQLite async (WAL, single-writer) é o gargalo natural se houver paralelismo real de projetos. Sem ADR nomeando gatilho de revisão. | backend/requirements.txt (aiosqlite); docker-compose.yml | right-sizing | Fixar gatilho objetivo no ADR de banco; não migrar agora (Postgres = over-engineering). |
| 6 | baixa | CLAUDE.md descreve rotas (`/projetos/:id/cortes`, `editor-classico`) que não batem com a estrutura real `frontend/src/features/{editor,final-review,post-production}`. | CLAUDE.md (tabela de rotas) vs frontend/src/features/ | veracidade da doc | Atualizar tabela de rotas/estrutura no CLAUDE.md. |

**Right-sizing:** nada aponta over-engineering de stack — Remotion + worker Node + FFmpeg/QSV são proporcionais ao domínio (render de vídeo é pesado). O débito é de **registro de decisão** (ADRs) e **veracidade da doc-âncora**, não de escolha tecnológica.

### conventional-commit-gitmoji
- status: ok
- skill_invocada: sim
- resumo: O repo segue uma convenção Conventional-Commits-like consistente (`feature/fix/chore(D-xxx)`, português imperativo, rodapé Co-Authored-By, marcas `[unlock:]`), mas desvia do padrão da skill em três pontos sistemáticos: ausência de gitmoji, tipo não-canônico `feature` em vez de `feat`, e alguns commits que misturam assuntos.

| # | severidade | descrição | arquivo:linha | fonte/regra | próximo passo |
|---|---|---|---|---|---|
| 1 | alta | Nenhum commit usa gitmoji antes do tipo (desvio 100% da amostra). | git log | skill "Emoji ANTES do tipo" | Adotar daqui em diante (sem reescrever histórico) ou padronizar no `ai.ps1`/template. |
| 2 | média | Tipo não-canônico `feature` (vs `feat`), gerado por `ai.ps1`. Coerente internamente, diverge do vocabulário Conventional Commits. | feature(D-066), feature(F-062) | skill (`feat`) vs convenção local | Decisão consciente: manter `feature` OU alinhar a `feat`. Registrar a escolha. |
| 3 | média | Commits que misturam assuntos: `8a415f1` (D-065 + D-064), `e1c60c5` (4 frentes), `2660f96` (backend+frontend+migração, 6 unlocks). | 8a415f1, e1c60c5, 2660f96 | "Um commit por funcionalidade" | Dividir por intenção via staging seletivo; quando o pipeline entrelaça hunks, documentar a razão no corpo. |
| 4 | baixa | Subjects sem escopo `(D-xxx)` em vários commits (`3a7366b`, `e1c60c5`, `7267626`), tarefa só no rodapé. | 3a7366b, e1c60c5, 7267626 | convenção real do repo | Padronizar `(D-xxx)`/`(F-xxx)` sempre no header quando houver tarefa. |
| 5 | baixa | Subjects "narrativos" colando o enunciado bruto da demanda em vez de resumo ≤72 chars imperativo. | fc40c28, e1f113e, 9b0ec9b, 064812e | "Resumo ≤ 72 chars, imperativo" | Resumir intenção no subject; mover enunciado para o corpo/tracker. |
| 6 | baixa | Rodapé Co-Authored-By inconsistente (`3a7366b` só com `Task: F-063`, sem Co-Author). | 3a7366b | CLAUDE.md exige Co-Authored-By | Garantir o rodapé em todo commit assistido por IA. |

**Ancoragem:** itens 2 e 4 refletem tensão entre o padrão da skill (`feat`, emoji) e a convenção real do repo (`feature(D-xxx)` via `ai.ps1`). Não são "bugs" se deliberados — recomenda-se decidir e registrar a regra.

## Pontos a confirmar
- **`_formatar_transcricao_corte` é código morto?** (clean-code #4) — verificar se há chamador antes de remover.
- **`feature` vs `feat` e gitmoji são divergência deliberada?** (commits #2) — é decisão de processo do Paulo, não erro; só registrar a escolha no `ai.ps1`/CLAUDE.md.
- **`paths:` por escopo nas skills** (skill-router #3) — só aplicar com confirmação e diff.
- **Estratégia de provedores de IA** (proposal #1) — o "porquê" de n8n + Claude CLI + Gemini coexistirem é conhecido do dono; o ADR só formaliza.

## Próximos passos sugeridos (priorizado — este diagnóstico não corrige nada)
1. **CI** — `ci.yml` rodando pytest + vitest + tsc/build. → `open-source-readiness`.
2. **Quebrar o ciclo** `services/export.py` → `routers/cortes.py`. → `clean-architecture-guardian`.
3. **Fatiar `cortes.py`** — extrair `CorteService.atualizar` + mover helpers puros p/ `domain/`. → `clean-architecture-guardian`.
4. **Remover `print` de produção** em `remotion_render.py` (e os `[DB-DEBUG]` em `cortes.py`). → `clean-code-review`.
5. **Corrigir as rules de skills** — tirar `@angular-*`, consertar typo `@remotion-best-practices`. → `skill-router`.
6. **Atualizar CLAUDE.md** (3 pontos factuais: IA, fila de render, rotas) + semear `docs/adr/`. → `proposal-architect`.
7. **Decidir o padrão de commit** (gitmoji/`feat` no `ai.ps1`) e disciplina de 1 commit/assunto. → `conventional-commit-gitmoji`.
