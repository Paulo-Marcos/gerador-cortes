# ADR-0015: Camadas globais e domínio por agregado

- **Status:** Aceito
- **Data:** 2026-09-23
- **Revisão:** 2026-09-23 — a versão aceita de manhã criava um pacote por contexto,
  cada um com as quatro camadas. Estava errada: a referência, o `investimentos`, tem
  **camadas globais** e divide só o **domínio**. Corrigida no mesmo dia, antes de
  qualquer código seguir a versão anterior.
- **Decisores:** Paulo Marcos
- **Relacionado:** [ADR-0001 do `investimentos`](#referências) (a referência),
  [diagnóstico de 16/09](../interno/diagnostico/diagnostico-2026-09-16.md), épicos E-051
  a E-055

## Contexto

O backend já está em quatro camadas — `routers/`, `services/`, `infrastructure/`,
`domain/` — e as setas entre elas são verificadas pelo import-linter. O problema está
**dentro** de cada camada, onde tudo é plano: 74 módulos em `domain/`, 78 em
`services/` e 18 na raiz de `app/`. Nada diz a que agregado um módulo pertence,
nem quais regras cruzam agregados; um módulo novo acaba onde der.

A referência é o `investimentos` (BolsoFundo), e ele resolve isso assim:

- **Quatro camadas globais**, uma de cada — `Api`, `Application`, `Domain`,
  `Infrastructure`. O ADR-0001 dele: *"um único backend em camadas, com um núcleo de
  domínio rico"*.
- **O domínio se divide por agregado** (`Positions/`, `Assets/`, `Dividends/`…). Cada
  pasta guarda a raiz do agregado, os objetos dele, os serviços de domínio e as
  **portas** de que ele precisa (`IQuoteProvider`). O que cruza agregados fica numa
  pasta comum (`Common/ValueObjects`).
- **A aplicação compõe agregados.** `Application/Portfolio/` não existe no domínio: são
  casos de uso (`GetNetWorthHandler`) que usam posições, ativos e cotações juntos.
- **A infraestrutura se organiza por adaptador** (`Persistence/`, `Quotes/`, `Time/`) e
  atende a todos.

O `investimentos` é C#. As regras valem; a sintaxe, não — ver §6.

## Decisão

### 1. As camadas são globais

Uma camada de cada, para a aplicação inteira. Os nomes atuais ficam:

| Camada | Pacote | Papel |
|---|---|---|
| API | `routers/` | só traduz HTTP ↔ caso de uso |
| Aplicação | `services/` | casos de uso: orquestram um ou **vários** agregados |
| Infraestrutura | `infrastructure/` | adaptadores do mundo externo, servindo a todos |
| Domínio | `domain/` | regras de negócio, sem efeito colateral |

Direção de dependência: `routers → services → infrastructure → domain`, como hoje. A
aplicação pode chamar a infraestrutura diretamente.

Dentro de `services/` e `infrastructure/`, subpastas por **área** são permitidas quando
ajudam a achar o código — sem virar parede: um caso de uso usa quantos agregados
precisar.

### 2. O domínio se divide por agregado

#### O critério

Os termos, como Evans os define em *Domain-Driven Design*:

- **Entidade** — definida pela identidade e pela continuidade ao longo do tempo, não
  pelos atributos.
- **Objeto de valor** — definido só pelos atributos; sem identidade própria, imutável,
  trocado inteiro quando muda.
- **Agregado** — conjunto de objetos tratado como uma unidade para mudar dados. Tem uma
  raiz; de fora só se referencia a raiz; a transação não cruza a fronteira.
- **Serviço de domínio** — operação de negócio que não pertence naturalmente a
  nenhuma entidade ou objeto de valor.

**O que decide um agregado é invariante, não pertencimento.** A pergunta não é "isto
pertence àquilo?", e sim: **que regra quebraria se eu salvasse um sem o outro?** Se
nenhuma quebra, são agregados separados, ligados pelo identificador.

Dependência de existência — "o corte não existe sem o projeto" — é real, mas não põe o
corte dentro do projeto. É o caso que Vaughn Vernon usa para ensinar isso: um software
de Scrum modelou o Produto como um agregado só, contendo itens de backlog, releases e
sprints, porque "tudo pertence ao produto". Resultado: salvar um item de backlog
invalidava o salvamento de outro usuário que agendava uma release, e mexer num item
carregava o produto inteiro. O diagnóstico dele: invariantes falsas. A solução foram
quatro agregados ligados por `ProductId`. Dali saem as quatro regras dele:

1. Modele invariantes **verdadeiras** dentro da fronteira de consistência.
2. Faça agregados **pequenos**.
3. Referencie outro agregado **pelo identificador**, nunca pelo objeto.
4. Fora da fronteira, aceite **consistência eventual**.

O domínio aqui é **funcional** — regras escritas como funções sobre dados; os modelos
do SQLAlchemy são a persistência. Então "agregado" não pede uma classe com repositório
para cada um. Ele decide três coisas: **onde mora cada regra**, **o que a aplicação
salva junto** numa transação e **quem referencia quem pelo identificador**.

#### Os agregados

```
domain/
├── projeto/          # Projeto: ciclo, legendas, transcrição, diarização, chat
├── corte/            # Corte: ciclo, desvios, blocos, ordem, junção, bruto, cenas, layout
│                     #   + Metadado do corte: texto, capa, padrões de thumbnail
├── short/            # Short: segmentos, palco, gancho, legenda, capa, cenas, prontos
│                     #   + Metadado do short: texto de publicação
├── publicacao/       # Publicação (agregado pequeno, alvo por identificador)
│                     #   + serviços de domínio: agendamento, ritmo, liberação, retenção
├── canal/            # Canal: identidade, tema, skills editoriais
├── live_candidata/   # Live candidata: ranking
└── compartilhado/    # o que MAIS DE UM agregado usa
```

#### Por que cada fronteira

| Decisão | Evidência no código (23/09) |
|---|---|
| **Corte não fica dentro de Projeto** | Máquinas de estado independentes: RN-01 (Projeto) e RN-04 (Corte), sem transição de um que dependa do estado do outro. O Projeto atravessa a ingestão inteira com **zero** cortes. Quase toda operação mexe em **um** corte. E o Projeto carrega a transcrição: só adiar a leitura dela levou a listagem de 1.649 ms para 250 ms e de 80,2 MB para 0,6 MB por requisição (D-431) — com o corte dentro do Projeto, cada edição de corte pagaria isso. O `cascade` que apaga os cortes junto com o projeto é dependência de existência, coordenada pela aplicação. |
| **Short não fica dentro de Corte** | O short tem ciclo próprio (candidato, curadoria, render, publicação), jobs de render longos, metadado e publicações próprias. A herança do palco padrão (D-570) é resolvida **na leitura**, não é regra de gravação. Não há no domínio regra que revalide o short a cada edição do corte. Exceção conhecida: a **junção de cortes** move os shorts do corte absorvido na mesma transação (`services/corte.py`) — operação que cruza os dois agregados, coordenada pela aplicação. Vernon admite a exceção, e o motivo da regra (conflito entre usuários simultâneos) não existe numa instalação de um usuário. |
| **Metadado é objeto de valor do seu dono, não agregado** | `MetadadoCorte` tem `corte_id` único e `MetadadoShort` tem `short_id` único: 1:1. Ninguém se refere a "o metadado X", e sim ao "metadado do corte Y" — a identidade que importa é a do dono. Metadado de corte (texto do YouTube, capítulos, tags, capa) e de short (texto de publicação) são **tipos diferentes**. A tabela própria é decisão de persistência. O Fire e a indicação para shorts foram do metadado para o Corte no D-713 (migration 007). |
| **Publicação é agregado pequeno** | "Publicar", o ato, é da aplicação (orquestra os adaptadores) e dos serviços de domínio (agendamento, ritmo, liberação). "A publicação", o fato, é **entidade**: tem identidade, estado (`aguardando` → publicada → despublicável, D-566), URL e data, e a retenção (RN-15/16) consulta cada uma. Ela aponta para **short ou corte** (`alvo_tipo` + `alvo_id`, sem chave estrangeira), então não cabe dentro de nenhum dos dois. O código já viveu isso: antes do D-564 só existia `Corte.tiktok_publicado_em`, uma publicação dentro do corte, que não comportou várias plataformas nem os shorts. |
| **Canal não é a raiz de tudo** | Cada canal tem o **seu próprio banco** (ADR-0005), e o Projeto nem guarda o canal — `canal_origem` é o canal de onde veio a live. O canal dono é o escopo em que os dados moram, não o topo de uma árvore; como o `Owner` do `investimentos`, que é um agregado mínimo referenciado pelo `OwnerId` em 13 pastas do domínio e não contém nenhuma. O Canal é agregado **da própria configuração**: identidade, tema, mascote e skills editoriais versionadas. |
| **Live candidata é agregado** | Ciclo próprio no ranking; quando promovida, passa a apontar para o Projeto por `projeto_id`. |

#### A pasta compartilhada

- **Dentro do agregado ficam os objetos daquele agregado** — raiz, entidades, objetos
  de valor, serviços de domínio e as portas que só ele usa.
- **O que serve a mais de um agregado vai para `compartilhado/`** — entidade, objeto
  de valor ou serviço. O critério é o uso real, medido, não o nome: `formato_video`
  fala de "horizontal e vertical", mas só o short o usa, então fica em `short/`.
- **Um agregado não importa outro.** O que ele precisa de outro vai para
  `compartilhado/`.
- A regra vira contrato do import-linter — agregados como **irmãos independentes**
  (`|`) sobre `compartilhado`:

  ```toml
  [[tool.importlinter.contracts]]
  id = "agregados-independentes"
  type = "layers"
  layers = [
      "app.domain.projeto | app.domain.corte | app.domain.short | app.domain.publicacao | app.domain.canal | app.domain.live_candidata",
      "app.domain.compartilhado",
  ]
  ```

  Medido em 23/09 sobre os 74 módulos de hoje: com este mapa, **só uma** importação
  cruza dois agregados — `shorts_prontos` usa `Plataforma`, de `publicacao`.
  `Plataforma` é um objeto de valor de dois agregados e vai para `compartilhado/`; com
  isso o contrato nasce valendo, sem exceção.

#### Renderização não é agregado

Os 15 módulos que montam comandos de ffmpeg e o bundle do Remotion, mais dois de imagem
e um de *retry*, são conhecimento de **ferramenta** — como executar, e não o que
decidir. Saem do domínio para a infraestrutura no D-696, com medição antes e depois (a
regra do render). O que eles consomem — geometria do palco, cascata de layout, filtros
escolhidos — continua no domínio. Medido: nenhum módulo que fica no domínio importa um
dos que saem, então a saída não cria seta errada.

### 3. `core`: transversal e sem regra de negócio

`app/core/` guarda o que todas as camadas usam e nenhuma possui: logging, estado do
processo (tarefas ativas), execução de processo externo, erros de domínio. O `core` só
importa `domain` e bibliotecas; qualquer camada o importa, **exceto `domain`** —
logging e estado de processo são efeito colateral. Contratos `core-na-base` e
`dominio-puro` (em vigor desde a A2).

Estado de processo com **um dono só** fica no dono (D-700, medido em 25/09/2026):
as filas de progresso, o lote de publicação, os caches e os conjuntos "em voo"
são usados pelo próprio módulo ou por services e routers, que já podem importá-lo.
Levá-los ao `core` faria o `core` conhecer tipos da aplicação, que o
`core-na-base` proíbe. Vão para o `core` os registros que várias camadas usam
(tarefas ativas, trabalhos em voo) e os **mecanismos** repetidos: `PorLoop`, que dá
a semáforos e locks do asyncio uma instância por event loop.

### 4. Porta (`typing.Protocol`) só com motivo

Porta entra quando há **mais de uma implementação real** (o caso de `GeradorIA`:
Claude, Gemini, modo manual e, na v0.4, chave de API) ou **uma seta que continuaria
errada mesmo com o módulo no endereço certo**. Módulo na camada errada muda de
endereço; não ganha porta.

A porta mora **no domínio, na pasta do agregado que precisa dela** (ou em
`compartilhado/`, se mais de um precisa) — como `IQuoteProvider` em `Positions/`. A
implementação mora na infraestrutura.

### 5. Como uma requisição corre

É o fluxo do `investimentos` (ADR-0003 dele), em Python:

1. **Router** recebe o HTTP, monta a entrada do caso de uso, chama o service, devolve o
   schema de resposta. Sem regra, sem banco, sem cliente externo. O `summary` da rota
   cita a RN coberta.
2. **Service** é o caso de uso: carrega o que precisa, chama o domínio, persiste. Pode
   usar vários agregados.
3. **Domínio** decide. Recebe dados, devolve dados ou levanta um **erro de domínio**.
4. **Erro de domínio** vira `application/problem+json` (RFC 9457) num handler global,
   por categoria — validação → 400, não encontrado → 404, regra de negócio → 422;
   exceção inesperada → 500 genérico, sem vazar detalhes (D-697).
5. **"De quem são os dados"** vem de um ponto só, como o dono corrente do
   `investimentos`: aqui é o **canal ativo** (`identidade_do_canal_ativo()`), nunca um
   campo do corpo da requisição.

### 6. Adaptação ao Python

| No `investimentos` (C#) | Aqui (Python) | Por quê |
|---|---|---|
| quatro projetos `.csproj` | quatro pacotes em `app/` | em Python a fronteira entre camadas é o import-linter, não referência de projeto |
| `record` de comando | `@dataclass(frozen=True)` | imutável e com igualdade por valor |
| classe `Handler` com `HandleAsync` | função `async` no service, recebendo as dependências como parâmetro; classe só quando as dependências forem muitas | é o que o *Architecture Patterns with Python* faz na camada de serviço |
| interface `I…` | `typing.Protocol` | tipagem estrutural: o adaptador não precisa herdar de nada |
| `AddApplication()` / `AddInfrastructure()` e contêiner de DI | `Depends` do FastAPI na borda e composição explícita; **sem contêiner de DI** | o livro recomenda injeção manual em Python; contêiner é cerimônia aqui |
| `Scoped` (um `DbContext` por requisição) | dependência `get_db` com `yield` | já existe |
| `Singleton` | instância no módulo ou fábrica com `functools.cache` | |
| entidade de domínio separada do EF Core | **o modelo do ORM continua sendo o de persistência** (`models.py`); o domínio trabalha com dados e dataclasses, e a tradução fica na aplicação | o livro alerta que separar o ORM *"não compensa"* onde a aplicação é CRUD; o `dominio-puro` já impede o domínio de importar `models` |

E uma regra que o C# não precisa: **o `__init__.py` de cada pasta de agregado fica
vazio**, sem reexportar os módulos. Em Python, importar `domain.corte.x` executa o
`__init__` de `domain.corte`; se ele importar os irmãos, qualquer import puxa o
agregado inteiro e abre caminho para ciclo. Importa-se do módulo, pelo caminho
completo.

### 7. Como migrar

- **Um tipo de mudança por commit.** Mudar de endereço é renomear e atualizar imports,
  sem alterar comportamento; mudança de comportamento vai em outro commit.
- **Cada módulo se move uma vez**, direto para o endereço final: o E-051 corrige a
  camada (`llm_calls_store` vai para `infrastructure/`, e fica lá); o E-052 e o E-053
  distribuem o domínio nas pastas de agregado e organizam `services/` por área.
- **Shim só quando precisa**: reexportação no caminho antigo, quando há importadores
  que não podem mudar no mesmo commit (arquivo travado, ou importadores demais).
  Reexportação, nunca cópia — uma cópia partiria em dois o estado de um singleton.
  Todo shim tem data para morrer (D-709).
- **O placar só desce**: linha nova em `ignore_imports` não entra, e pasta de agregado
  nova entra no contrato `agregados-independentes` no mesmo commit.
- **Referência por string também muda**: `monkeypatch.setattr("app.domain.x…")` não
  aparece num grep de `import`. Procura-se o caminho como texto.
- **Trava não se contorna**: desbloqueio pelo protocolo do `AGENTS.md`, uma marca por
  trava.

### 8. Ordem

E-051 (setas e `core`) → E-052 e E-053 (domínio por agregado, `services/` por área,
casos de uso fora dos routers) → E-054 e E-055 (regras únicas e funções-deus). O E-056
(chave de API) depende da porta `GeradorIA`, que nasce no D-695.

## Consequências

- "Onde fica este módulo?" tem resposta por regra: qual camada; se for domínio, qual
  agregado — ou `compartilhado/`, se mais de um usa.
- A independência entre agregados é verificada por máquina, não por combinação.
- A aplicação continua livre para compor agregados, que é onde mora a maior parte dos
  casos de uso do CutCut (o render junta corte, short e canal).
- Operações que atravessam agregados — apagar um projeto e os cortes dele, juntar dois
  cortes e mover os shorts — são coordenadas pela aplicação, numa transação, e ficam
  visíveis como tal.
- `compartilhado/` pode virar gaveta de bagunça. Por isso o critério é uso medido por
  mais de um agregado, e não "parece genérico".
- Shims acrescentam um desvio de leitura até o D-709.

## Alternativas consideradas

- **Um pacote por contexto, cada um com as quatro camadas** — a versão aceita e
  revisada em 23/09. Descartado: repete aplicação, infraestrutura e API por contexto,
  quando os casos de uso atravessam agregados (`Portfolio/` no `investimentos`, render
  aqui); e não é o que a referência faz.
- **Um agregado só, com o Canal (ou o Projeto) na raiz**, porque "todo canal tem
  projetos, que têm cortes, que têm shorts". Descartado: é o erro do Produto no caso
  Scrum do Vernon — pertencimento no lugar de invariante. Cada edição de short
  carregaria e travaria a árvore inteira, e nenhuma regra real exige isso (§2).
- **Metadado como agregado próprio** — proposto e descartado em 23/09: é 1:1 com o dono
  e não tem identidade que importe ao negócio; é objeto de valor do corte ou do short.
- **Hexagonal completo** — porta para todo adaptador, só um `bootstrap` conhece os
  concretos. Descartado por ora: dezenas de adaptadores com uma única implementação
  viram fiação sem ganho. Volta se surgir segunda implementação onde não há porta.
- **Separar o modelo de domínio do ORM** (mapeamento clássico do SQLAlchemy).
  Descartado por ora: `models.py` está travado, o domínio já não o importa, e o custo
  só se paga onde o domínio é rico a ponto de o ORM atrapalhar.
- **Deixar o domínio plano e só consertar as setas.** Resolve o `ignore_imports`, mas
  não diz onde mora o próximo módulo.

## Referências

- `investimentos`: `docs/adr/0001-stack-e-arquitetura-mvp.md` (camadas e agregados) e
  `docs/adr/0003-api-rest-estilo-composicao-e-contrato.md` (execução, DI, erros)
- Eric Evans, *Domain-Driven Design* (2003) — entidade, objeto de valor, agregado,
  serviço de domínio
- Martin Fowler, [DDD Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html)
- Vaughn Vernon, [Effective Aggregate Design](https://www.dddcommunity.org/library/vernon_2011/)
  e *Implementing Domain-Driven Design*, cap. 10:
  [o caso Scrum](https://www.informit.com/articles/article.aspx?p=2020371),
  [invariantes verdadeiras](https://www.informit.com/articles/article.aspx?p=2020371&seqNum=2),
  [agregados pequenos](https://www.informit.com/articles/article.aspx?p=2020371&seqNum=3),
  [referência por identidade](https://www.informit.com/articles/article.aspx?p=2020371&seqNum=4)
- *Architecture Patterns with Python* (Percival e Gregory):
  [camada de serviço](https://www.cosmicpython.com/book/chapter_04_service_layer),
  [repositório e ORM](https://www.cosmicpython.com/book/chapter_02_repository.html),
  [injeção de dependência](https://www.cosmicpython.com/book/chapter_13_dependency_injection.html)
- Import Linter: [contrato de camadas, irmãos independentes](https://import-linter.readthedocs.io/en/v2.11/contract_types/layers/)
- [Protocols — especificação de tipos do Python](https://typing.python.org/en/latest/spec/protocol.html)
- RFC 9457 no FastAPI: [discussão no repositório do FastAPI](https://github.com/fastapi/fastapi/discussions/14517)

## Gatilho de revisão

- Um caso de uso que não cabe na aplicação sem um agregado importar outro.
- Uma regra real que precise valer entre dois agregados **em toda gravação** — aí eles
  talvez sejam um só.
- `compartilhado/` crescendo mais rápido que as pastas de agregado.
- Segunda implementação para um adaptador que hoje não tem porta.
