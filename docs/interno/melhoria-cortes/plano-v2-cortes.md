# Plano — Melhoria da etapa de criação dos cortes (V2 editorial)

> Origem: sessão de análise de 2026-07-08 (avaliação etapa por etapa da skill
> `cortador-expert` + pesquisa web sobre a prática de canais de cortes no
> YouTube 2024–2026). Decisões ratificadas pelo Paulo nesta mesma sessão.
> Este documento é a fonte de escopo para a execução das demandas D-298–D-307.

## 1. Decisões ratificadas

1. **Análise aditiva**: `analisar_via_claude` nunca apaga cortes existentes; deletar é ação do editor (→ D-298).
2. **Diarização em toda análise**: análise de intervalo também recebe `falantes_map`; skills ganham regras de uso dos rótulos `[CANAL]/[OUTRO]` (→ D-299 + V2).
3. **Thinking tokens ligado** na etapa Propor cortes (~8k–16k), por ser a etapa de maior julgamento editorial (→ D-300).
4. **Sem lentes de sorteio** na etapa cortes; variação deriva do conteúdo de cada corte. Etapas que mantiverem lentes: UMA lente por geração, nunca por chunk (→ D-301).
5. **Teto de 30% dos desvios REMOVIDO** ("não faz sentido nenhum"): corta-se tudo que é necessário; o guardrail passa a ser semântico — a cadeia lógica do argumento deve permanecer intacta após as remoções. O controle de qualidade é a telemetria (D-303), não uma cota.
6. **Duração**: mín 5 / ideal 8–18 / máx 30 minutos. Regra soberana: a completude do argumento decide, não a meta de views.
7. **Título**: 55–60 caracteres (títulos vinham saindo grandes), tese/nomes próprios carregados no início, anti-clickbait mantido. Vale para `titulo_proposto` (cortador) e para a metadados-expert.
8. **Arquitetura das passadas — opção (c)**: duas passadas especializadas E a segunda com poder de **revisar** os desvios da primeira (hoje o merge é apenas-aditivo).
   - Passada 1 (cortador-expert): recorte + desvios **estruturais** (música, digressão > 8 min → corte próprio, bloco NÃO_RECOMENDADO no meio de corte válido).
   - Passada 2 (trechos-expert): **editora de coesão** — a história do corte fica conexa, coerente e coesa; remove repetições, chat, tangentes; pode corrigir/remover desvio ruim da passada 1.
9. **Score de ranking** (Hook/Flow/Value, sem Trend) já entra na V2; a D-303 consome os scores depois.
10. **Contextualização de abertura**: o corte pode abrir com um texto CURTO que situa o assunto (ex.: "Sobre o último jogo do Flamengo…"). Regra de corte: se precisar de texto longo para o corte fazer sentido, não vale a pena — descarta a frase (e talvez o corte). Alimenta a 1ª cena do D-295.
11. **Papel da fala `[OUTRO]`**: deve ser considerada na análise. Dois usos: (a) distinguir pausa por troca de falante de pausa/enrolação da mesma pessoa (afeta remoção de silêncio na trechos-expert); (b) nas cenas, saber quando o autor está criticando terceiro — a afirmação criticada nunca vira cena de endosso (→ D-307). Só se aplica a projetos com reação/mais de uma pessoa.
12. **Feedback loop com dados reais**: levantar estatísticas de TUDO já publicado (200+ cortes: views, watch time, retenção, CTR) com rotina periódica de atualização, e usar como base dos próximos cortes (→ D-305, conduzido em conjunto com o Paulo).

## 2. Especificação da V2 (escopo da D-302)

### cortador-expert v2
- Princípio "vídeo-ensaio autossuficiente" mantido; vira critério de aceitação explícito no checklist ("o corte se sustenta 100% sem a live?").
- Duração: mín 5 / ideal 8–18 / máx 30.
- Remover o teto de 30%; substituir por guardrail semântico de coesão.
- Borda inicial escolhida pelo **ponto de entrada mais forte do argumento** (frase-gancho), não pelo início burocrático do assunto. Primeiros 30s do corte precisam de gancho.
- Desvios: só os estruturais (música; digressão > 8 min vira corte próprio; bloco NÃO_RECOMENDADO no meio de corte válido). Critério: "serve à história DESTE clipe?".
- Regras de diarização: como usar `[CANAL]/[OUTRO]` (fala reagida pode ser setup; a tese é do canal; corte pode abrir com fala de terceiro apenas como gancho contextualizado).
- Título: 55–60 chars, tese com nomes próprios no início.
- Re-hook: em cortes > 8 min, apontar onde a tese é reapresentada (ou registrar a ausência na `justificativa`).
- Seção "Variação editorial" reescrita: ângulo derivado do conteúdo, sem repetir o ângulo do corte anterior (substitui as lentes de sorteio — D-301).
- JSON de saída ganha: `frase_gancho` (timestamp + frase mais forte), `contextualizacao` (frase curta de abertura, ou null se não for natural), `score` ({hook, flow, value, total}) — mantendo compatibilidade com o importador (`AnaliseService.importar_resultado` ignora chaves extras; persistência dos novos campos entra no escopo).
- Checklist final expandido: sustenta-se sem a live? / gancho nos 30s? / cadeia lógica sobrevive às remoções?

### trechos-expert v2 ("editora de coesão")
- Missão reescrita: deixar a história do corte conexa, coerente e coesa — não "limpeza genérica".
- Mantém postura conservadora no que NUNCA remover (tese, argumentos, pausas de ênfase, setup indispensável).
- Remove teto de 30%; guardrail semântico.
- Pausa por troca de falante ≠ silêncio a remover (projetos diarizados).
- Ganha poder de **revisão**: pode propor remoção/ajuste de desvios existentes (fim do merge apenas-aditivo — mudança de código na política de merge + UI para diferenciar "novo" de "revisado").

### Emendas em skills vizinhas
- metadados-expert: título 55–60 chars (emenda pontual, junto da V2).
- cenas-expert: semântica de crítica vs endosso com diarização (→ D-307, demanda própria).

## 3. Mapa de demandas

| ID | Demanda | Cobre | Tipo |
|----|---------|-------|------|
| D-298 | Analisar via Claude em modo aditivo | Decisão 1 | fix cirúrgico |
| D-299 | Diarização na análise de intervalo | Decisão 2 | fix cirúrgico |
| D-300 | Thinking tokens na etapa Propor cortes | Decisão 3 | config |
| D-301 | Remover lentes de sorteio da etapa cortes | Decisão 4 | fix cirúrgico |
| D-304 | Botão "gerar trechos de todos os cortes" na UI | Sintoma da 2ª passada | UI |
| D-306 | Diagnosticar cortes chegando quase sem trechos | Causa raiz da 2ª passada | investigação |
| D-303 | Telemetria: snapshot IA vs corte final editado | Decisão 5 (controle por telemetria) + treino futuro | fundação de dados |
| D-305 | Estatísticas YouTube dos cortes publicados | Decisão 12 | fundação de dados |
| D-302 | **Redesign V2: cortes e desvios (coesão narrativa)** | Decisões 5–11 + seção 2 deste doc | épico editorial |
| D-307 | Cenas cientes de diarização (crítica vs endosso) | Decisão 11b | editorial (cenas) |

## 4. Cronograma em ondas

**Onda 1 — Cirúrgicas + diagnóstico** (paralelizáveis, exceto onde tocam o mesmo arquivo)
- D-306 (investigação — informa a D-302 e pode ter fix rápido)
- D-298, D-299, D-300, D-301, D-304
- ⚠️ Concorrência: D-298 e D-301 tocam `backend/app/services/claude_ia.py` — serializar ou isolar em worktree; D-300 e D-301 tocam `editorial_skills.py`/defaults — idem.

**Onda 2 — Fundação de dados** (antes/junto da V2; cada live tratada sem snapshot é dado de treino perdido)
- D-303 (antecipar ao máximo)
- D-305 (independente; pode correr em paralelo com a Onda 3)

**Onda 3 — V2 editorial**
- D-302 (cortador-expert v2 + trechos-expert v2 + política de merge revisável + emenda de título na metadados-expert) — usa a seção 2 deste doc como escopo
- D-307 (cenas; depende das regras de diarização definidas na D-302, mesma família editorial → não despachar em paralelo com a D-302)

**Onda 4 — Feedback loop** (demandas a criar quando chegar lá)
- Levantamentos com os dados das D-303/D-305: duração × retenção (validar faixas), títulos × CTR, quedas recorrentes → realimentar os prompts das skills
- Heatmap "Most Replayed" da live original como sinal de seleção
- Eventual few-shot/treino com os pares proposta-IA × corte final

## 5. Referências da pesquisa (síntese)

- Duração: clipes 5–10 min ≈ 3× watch hours vs < 5 min; 15–30 min → retenção cai para 30–45%; tendência 2024–26 de volta ao long-form.
- Primeiros 30s decidem: 55%+ do abandono no 1º minuto; estrutura impacto (0–5s) → promessa (5–15s) → stakes (15–30s).
- "Contextual incompleteness" é a falha nº 1 das ferramentas de clipping (OpusClip etc.); 20–40% dos clipes de IA são descartados por humanos.
- Não existe regra de mercado de "% máximo removido" — o critério é semântico.
- Título: 55–60 chars; A/B nativo do YouTube decide por watch time/impressão (não CTR) → anti-clickbait correto.
- Público 25+ analítico: cortes a cada 20–40s em mudança de tópico/emoção; preservar pausas de ênfase.
