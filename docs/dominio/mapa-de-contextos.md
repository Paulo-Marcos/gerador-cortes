# Mapa de contextos

> Criado na D-667 a partir do diagnóstico de 16/09/2026. Os 59 módulos citados
> foram conferidos como existentes em 22/09/2026. É um mapa **estratégico**:
> diz o que cada contexto faz e quem depende de quem. A reorganização física
> das pastas por contexto é trabalho da v0.4 (E-053).
>
> Termos em [glossario.md](glossario.md); regras em
> [regras-de-negocio.md](regras-de-negocio.md).

## O fluxo, de ponta a ponta

```
Canal ──────────────────────────────────────────── (upstream de todos)
  │
Descoberta de lives ─► Projeto / Ingestão ─► Análise editorial ─► Corte / Edição
                                                                      │
                                   ┌──────────────────────────────────┤
                                   ▼                                  ▼
                        Layout / Pós-produção ─► Render        Metadados / Capa
                                   │                                  │
                                   ▼                                  ▼
                                Shorts ─────────────────────────► Publicação
                                                                      │
                                                                      ▼
                                                                   Retenção
```

## Os contextos

| Contexto | Responsabilidade | Entidades | Módulos principais | Relações |
|---|---|---|---|---|
| **Canal** | Identidade, tema, mascote, credenciais e skills editoriais de cada canal. | Canal (identidade no `settings.db`), skill editorial, tema | `channel_config_loader`, `editorial_skills`, `editorial_scaffolds`, `editorial_identity`, `services/channels`, `channel_paths` | Upstream de todos. Desde a D-666 não vaza mais para o `models.py`. |
| **Descoberta de lives** | Busca, ranking (VPH + recência) e fila de lives candidatas. | Live candidata | `domain/ranking_lives`, `services/ranking_lives`, `ranking_settings`, `routers/ranking_lives`, `routers/youtube_browser` | Promove uma candidata a Projeto. |
| **Projeto / Ingestão** | Download, legenda, transcrição fiel, diarização. | **Projeto** (raiz), transcrição | `services/ingestao`, `services/transcricao_fiel`, `services/diarizacao`, `domain/projeto/vtt_parser`, `domain/projeto/json3_parser`, `domain/projeto/ciclo_projeto` | Upstream da Análise. Ciclo de vida no domínio (RN-01). |
| **Análise editorial** | Propor cortes via IA (Claude CLI, Antigravity ou modo manual; ADR-0004) e auditar as chamadas. | Proposta de corte, chamada de LLM | `services/analise`, `services/claude_ia`, `services/telemetria_ia`, `infrastructure/llm_calls_store`, `provider_ia`, `infrastructure/claude_cli_client`, `infrastructure/antigravity_cli_client`, `domain/projeto/chunker`, `domain/corte/corte_mapper` | Consome as skills do Canal. `corte_mapper` é a camada anticorrupção entre a resposta da IA e o Corte. |
| **Corte / Edição** | Bordas, desvios, ordem, divisão e junção, bruto. | **Corte** (raiz), desvio, bloco | `services/corte`, `services/desvios`, `services/export_bruto`, `domain/corte/ordem_cortes`, `domain/corte/juncao_cortes`, `domain/corte/arranjo_blocos`, `domain/corte/segment_calculator`, `domain/corte/ciclo_corte` | **Núcleo do domínio.** Ciclo de vida no domínio (RN-04). |
| **Layout / Pós-produção** | Regiões full/compartilhada, cascata de layout, cenas, filtros. | Layout do YouTube, cena | `domain/corte/youtube_layout`, `infrastructure/render/cinema_filters`, `services/cenas_remotion`, `services/youtube_palco` | Downstream de Corte; upstream de Render. Cascata parcial (RN-10). |
| **Render** | Grade, composição, overlays, fila do worker. | Job de render (fila em arquivo) | `services/remotion_render`, `services/pipeline_render`, `infrastructure/worker_queue`, `infrastructure/render/bruto_pipeline`, `infrastructure/render/overlay_codec` | Subdomínio técnico: serve Layout e Shorts. |
| **Metadados / Capa** | Título, descrição, capítulos, tags, thumbnail e molduras. | **Metadado** (1:1 com o corte) | `services/metadados`, `services/thumbnail`, `domain/thumbnail_encode`, `domain/corte/capa_tiktok` | Downstream de Corte. Carrega o Fire (RN-14). |
| **Shorts** | Candidatos, segmentos, enquadramento, palco vertical, gancho, legenda, render. | **Short** | `services/shorts`, `services/palco_shorts`, `services/render_short`, `domain/short/segmentos_short`, `domain/short/gancho_short`, `domain/short/palco_short`, `domain/short/metadados_short` | Downstream de Corte (tempo do bruto, RN-08) e de Layout (herança de palco, RN-11). |
| **Publicação** | YouTube, TikTok e Instagram (assistidos), ritmo e agendamento. | Publicação, agendamento, destino | `domain/publicacao/publicacao`, `domain/publicacao/ritmo_publicacao`, `domain/publicacao/agendamento`, `services/instagram_reels`, `services/tiktok_studio` | Downstream de Metadados e Shorts. Anticorrupção com as plataformas (API e Playwright). |
| **Retenção** | Decidir o que pode sair do disco. | Relatório de retenção, veredito | `services/media_retention`, `domain/publicacao/retencao_publicacao` | Downstream de Publicação (marcas por destino) e de Corte (Fire). Regras RN-15 e RN-16. |

## O que este mapa não é

- **Não é o mapa das travas.** As travas protegem funcionalidades homologadas,
  não contextos (ver [glossário](glossario.md#travas-protegem-funcionalidades-não-contextos)).
- **Não é a estrutura de pastas.** Hoje o código se organiza por camada
  (`routers/`, `services/`, `domain/`, `infrastructure/`); as fronteiras entre
  camadas são verificadas pelo import-linter (D-662). A organização por
  contexto é decisão da v0.4.
