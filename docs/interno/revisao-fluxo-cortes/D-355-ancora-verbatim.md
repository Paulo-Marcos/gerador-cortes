# D-355 — Âncora verbatim nas bordas propostas pela IA

## Problema

Hoje as bordas de **corte** nascem do timestamp "de memória" do LLM: ele estima o
`inicio_hms`/`fim_hms` do trecho e esse número **não passa por refinamento algum**.
Na prática erra por dezenas de segundos. O snap de palavra da D-339
(`snap_desvios.py`, janela 0.8s) só age em **desvios**, e mesmo assim só faz
micro-ajuste — não corrige um erro grosseiro de dezenas de segundos.

## O que o backend passa a aceitar (D-355)

Quando o LLM fornece a **citação verbatim** do texto onde a borda cai, o backend
ancora a borda no **tempo real daquela palavra** na transcrição word-level
(`palavras = [{texto, inicio_seg}]`, da D-337), via **busca janelada** com
`difflib` em torno do timestamp aproximado.

Campos **novos e opcionais** aceitos no JSON:

| Escopo | Campo | Significado |
|--------|-------|-------------|
| Corte  | `inicio_texto` | citação curta (~3-8 palavras) do **início** do corte |
| Corte  | `fim_texto`    | citação curta (~3-8 palavras) do **fim** do corte |
| Desvio | `inicio_texto` | citação curta do **início** do trecho a remover |
| Desvio | `fim_texto`    | citação curta do **fim** do trecho a remover |

Comportamento:

- **Corte**: busca janelada de **±60s** em torno do `inicio_hms`/`fim_hms`. Se
  `inicio_texto` faltar, o backend usa a `frase_gancho.texto` como âncora de
  início (piloto). O `inicio_hms`/`fim_hms`/`inicio_seg`/`fim_seg` do corte são
  recalculados a partir do tempo ancorado.
- **Desvio**: busca janelada de **±5s** ANTES do snap existente (o snap então faz
  o ajuste fino de borda de palavra). Sem citação, o snap age sozinho como hoje.

**Não-quebradiço** (garantido por código, sem depender do corpo):
- sem citação → mantém o timestamp atual;
- sem palavras word-level (VTT legado) → mantém o timestamp atual;
- similaridade abaixo do limiar (`0.6`) → mantém o timestamp atual;
- a âncora nunca inverte nem colapsa a borda (se inverteria, cai no par proposto).

A **busca janelada** também resolve o risco de frase repetida: uma citação que
aparece em dois pontos da live só é procurada na janela em torno do timestamp que
o LLM deu — a ocorrência de dentro da janela vence.

## Trecho a acrescentar ao CORPO da skill (aplicar em PROD, /canais)

> **Importante:** o corpo/scaffold default do repositório **não** foi alterado.
> O texto abaixo é para você colar no corpo da skill do **canal de PROD** em
> `/canais`. É opcional: mesmo sem ele, nada quebra — o backend simplesmente não
> terá citação e manterá o comportamento atual.

### `cortador-expert` (corpo)

Acrescente à seção que descreve como marcar as bordas do corte:

```
ÂNCORA DE BORDA (opcional, recomendado):
Para cada corte, além de inicio_hms/fim_hms, inclua a CITAÇÃO VERBATIM curta
(3 a 8 palavras) exatamente como aparece na transcrição, no ponto onde a borda
cai:
  - "inicio_texto": as primeiras palavras ditas no INÍCIO do corte;
  - "fim_texto": as últimas palavras ditas no FIM do corte.
Copie o texto LITERAL da transcrição (mesmas palavras, sem parafrasear). Isso
permite ancorar a borda no tempo real da fala. Se não tiver certeza da citação,
omita o campo — o timestamp será usado como está.
```

Exemplo de um corte no JSON de saída:

```json
{
  "titulo_proposto": "O Brasil vai crescer",
  "inicio_hms": "00:10:12",
  "fim_hms": "00:24:35",
  "inicio_texto": "o brasil vai crescer muito",
  "fim_texto": "e é isso que importa",
  "...": "demais campos v2 (frase_gancho, contextualizacao, score) permanecem iguais"
}
```

### `trechos-expert` (corpo)

Acrescente à seção que descreve como marcar cada desvio/trecho a remover:

```
ÂNCORA DE BORDA (opcional, recomendado):
Para cada desvio, além de inicio_hms/fim_hms, inclua a CITAÇÃO VERBATIM curta
(3 a 8 palavras) copiada LITERALMENTE da transcrição:
  - "inicio_texto": as primeiras palavras do trecho a remover;
  - "fim_texto": as últimas palavras do trecho a remover.
Se não tiver certeza, omita — o ajuste automático de borda continua funcionando.
```

Exemplo de um desvio no JSON de saída:

```json
{
  "inicio_hms": "00:12:03",
  "fim_hms": "00:12:41",
  "motivo": "tangente sobre o chat",
  "inicio_texto": "ah gente o chat ta perguntando",
  "fim_texto": "voltando ao que interessa"
}
```

## Referências de código (para auditoria)

- Domínio puro: `backend/app/domain/ancora_match.py`
  (`ancorar_borda`, `ancorar_intervalo`; reusa `achatar_palavras` da D-339).
- Cortes: `backend/app/services/analise.py`
  (`_bordas_ancoradas_do_corte`, `_palavras_word_level`; wiring em
  `importar_resultado` e `analisar_intervalo`).
- Desvios: `backend/app/services/claude_ia.py`
  (`_ancorar_desvio`, aplicado ANTES de `snap_desvio_a_palavras`).
- Testes: `backend/tests/domain/test_ancora_match.py`,
  `backend/tests/services/test_ancora_verbatim_d355.py`.
