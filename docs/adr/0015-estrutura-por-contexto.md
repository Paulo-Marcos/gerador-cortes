# ADR-0015: Estrutura do backend por contexto × camada

- **Status:** Aceito
- **Data:** 2026-09-23
- **Decisores:** Paulo Marcos
- **Relacionado:** [diagnóstico de 16/09](../interno/diagnostico/diagnostico-2026-09-16.md)
  (seção "Estrutura-alvo"), épicos E-051 a E-055

## Contexto

O backend é organizado por **camada técnica** — `routers/`, `services/`,
`infrastructure/`, `domain/` — e cada camada é plana: cerca de 80 services, 70
módulos de domínio e 15 módulos soltos na raiz de `app/`. O contexto de negócio só
aparece no nome do arquivo; há 15 pares com o mesmo nome em `domain/` e
`services/` (`capa_tiktok`, `ranking_lives`, `shorts`…), que já são fatias verticais
implícitas.

A v0.3 pôs guarda-corpos: quatro contratos do import-linter e a dívida conhecida
listada em `ignore_imports`, com cinco linhas em 23/09. Na mesma data havia 215
imports feitos dentro de função e três ciclos de import de pé (`claude_ia`↔`analise`,
`claude_ia`↔`metadados`, `editorial_skills`↔`editorial_scaffolds`). Import tardio é
como o código esconde um ciclo do Python; a estrutura plana não diz onde um módulo
novo deve morar, e ele acaba onde der.

Parte da dívida não é uma seta errada, é um **endereço errado**: `tarefas_ativas` só
usa a stdlib e guarda estado do processo; `llm_calls_store` abre `sqlite3`
diretamente. Nenhum dos dois é orquestração, e os dois moram em `services/`.

## Decisão

### 1. Alvo: um pacote por contexto

O backend passa a ser organizado por contexto, cada um com até quatro camadas —
`domain`, `application`, `infrastructure`, `api`. O `services/` de hoje é a camada
`application`; o `routers/` de hoje é a `api`.

| Contexto | O que guarda |
|---|---|
| `canal` | identidade, caminhos, tema, ajustes e assets do canal |
| `ia` | provedores de IA, fila de consultas e telemetria das chamadas |
| `editorial` | skills, scaffolds e prompts por canal |
| `descoberta` | ranking e busca de lives |
| `ingestao` | Projeto e Ingestão: download, legendas, transcrição, diarização |
| `analise` | Análise: cortes propostos, desvios, avaliação do bruto |
| `corte` | Corte: edição, divisão e junção, ordem, snapshots, cenas |
| `render` | pós-produção: pipeline, grade, palco, Remotion, proxy |
| `metadados` | Metadado do corte e thumbnail |
| `shorts` | Short: fábrica, palco, gancho, legenda, capa |
| `publicacao` | YouTube, TikTok e Instagram, agendamento, lote, retenção |

A árvore e a tabela de/para por módulo estão no diagnóstico.

### 2. `core`: o que é transversal e não tem regra de negócio

`app/core/` guarda o que todo contexto usa e nenhum possui: logging, estado do
processo (tarefas ativas, jobs), execução de processo externo, erros de domínio,
configuração e sessão de banco.

- O `core` só importa `domain` e bibliotecas externas. Nunca `routers`, `services`,
  `infrastructure`, `models`, `database` nem um pacote de contexto.
- Qualquer camada importa o `core`, **exceto `domain`**: domínio continua sem efeito
  colateral, e logging é efeito colateral.
- As duas regras viram contrato do import-linter no mesmo commit que cria o pacote.

### 3. Dentro de cada contexto, a mesma direção de hoje

`api → application → infrastructure → domain`. A camada de aplicação pode chamar a
infraestrutura diretamente, como os services fazem hoje.

### 4. Porta (`typing.Protocol`) só com motivo

Uma porta entra quando há:

- **mais de uma implementação real** — o caso de `GeradorIA`: Claude, Gemini, modo
  manual e, na v0.4, chave de API (E-056);
- **uma dependência que apontaria para o lado errado mesmo depois de o módulo estar
  no endereço certo.**

Módulo na camada errada **muda de endereço**; não ganha porta.

### 5. Como migrar

- **Duas mudanças, nunca misturadas.** O E-051 corrige a **camada** dentro da
  estrutura atual; o E-052 e o E-053 levam cada módulo para o **contexto**. Um módulo
  muda de camada no máximo uma vez e de contexto no máximo uma vez. O `core` é a
  exceção: nasce no endereço final. Exemplo: `llm_calls_store` vai de `services/`
  para `infrastructure/` no E-051 e para `ia/infrastructure/` no E-052, junto com os
  outros clientes de IA — e não sozinho, na frente deles.
- **Commit de mudança é puro:** renomeia e atualiza imports, sem mudar
  comportamento. Mudança de comportamento vai em outro commit.
- **Shim só quando precisa:** um módulo no caminho antigo que só reexporta o novo,
  usado quando há importadores que não podem mudar no mesmo commit (arquivo travado,
  ou importadores demais). É **reexportação, nunca cópia**: uma cópia partiria em
  dois o estado dos singletons — o registro de tarefas ativas, a fila de log. Todo
  shim tem data para morrer (D-709).
- **O placar só desce:** linha nova em `ignore_imports` não entra. Pacote de contexto
  novo entra **com o seu contrato no mesmo commit** — pacote sem contrato é
  território sem fiscalização.
- **Trava não se contorna:** desbloqueio pelo protocolo do `AGENTS.md`, uma marca por
  trava. Quando fatiar um arquivo travado, a trava de arquivo dá lugar a um teste de
  comportamento que proteja a mesma funcionalidade.

### 6. Ordem

E-051 (`core` e setas) → E-052 (`canal`, `editorial`, `ia`) → E-053 (contextos de
produto) → E-054 e E-055 (regras únicas e funções-deus). O E-056 (chave de API)
depende da porta `GeradorIA`, que nasce no D-695.

## Consequências

- "Onde fica este módulo novo?" passa a ter resposta por regra: qual contexto, qual
  camada.
- Cada etapa é medida por máquina: `ignore_imports` e contratos, não impressão.
- Durante a v0.4 convivem duas estruturas, a plana e a por contexto. Este ADR e os
  contratos são o mapa desse período.
- Shims acrescentam um desvio de leitura até o D-709.
- Alguns módulos se mudam duas vezes — de camada, depois de contexto. É o preço de
  cada commit ter um só tipo de mudança, que é o que mantém o bisect útil.

## Alternativas consideradas

- **Hexagonal completo** — porta para todo adaptador, só um `bootstrap.py` conhece
  os concretos, como o diagnóstico propôs. Descartado por ora: dezenas de adaptadores
  com uma única implementação viram fiação sem ganho para uma aplicação de um
  mantenedor, e o `AGENTS.md` pede não inventar abstração para o futuro. Volta à mesa
  se surgir segunda implementação onde hoje não há porta.
- **Mudar tudo de uma vez.** Impossível com as travas, e acaba com o bisect.
- **Ficar por camada e só consertar as setas.** Resolve as cinco linhas, mas não diz
  onde mora o próximo módulo; os imports tardios não teriam por que cair.
- **Levar direto para o contexto já no E-051.** Criaria `ia/` com um módulo só,
  enquanto os clientes de IA continuariam em `infrastructure/`.

## Gatilho de revisão

- Segunda implementação para um adaptador que hoje não tem porta.
- Pacote de contexto sem contrato, ou `ignore_imports` crescendo.
- Imports tardios que não caem depois do E-052: sinal de que a divisão em contextos
  está errada.
