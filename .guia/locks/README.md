# Sistema de Travas (Locks) — Guia do Desenvolvedor

Este diretório guarda o registro de **funcionalidades travadas** do projeto.
Travas impedem que agentes de IA (Claude, Cursor, Codex, Cline, Copilot,
etc.) editem código já homologado **sem autorização explícita**.

> Para os agentes, a fonte de regras é [`AGENTS.md`](../../AGENTS.md) e
> [`CLAUDE.md`](../../CLAUDE.md) na raiz. Este README é para **você**, humano,
> entender como operar o sistema.

## Índice

- [Visão geral](#visão-geral)
- [Como funciona o bloqueio](#como-funciona-o-bloqueio)
- [Setup inicial (uma vez)](#setup-inicial-uma-vez)
- [Adicionando uma trava](#adicionando-uma-trava)
- [Editando arquivo travado (unlock temporário)](#editando-arquivo-travado-unlock-temporário)
- [Removendo uma trava permanentemente](#removendo-uma-trava-permanentemente)
- [Auditando desbloqueios](#auditando-desbloqueios)
- [Convenções](#convenções)
- [Casos especiais](#casos-especiais)
- [Troubleshooting](#troubleshooting)

## Visão geral

```
.guia/locks/registry.yaml  ← fonte da verdade (lista de travas)
.guia/locks/README.md      ← este arquivo
bin/check-lock.py          ← CLI: gerencia, valida, roda no hook e no CI
.githooks/commit-msg       ← hook git que rejeita commits violando trava
.github/workflows/         ← CI que rejeita PRs violando trava
   lock-check.yml
AGENTS.md / CLAUDE.md      ← regras para os agentes de IA
```

Três camadas de defesa, redundantes de propósito:

1. **Documentação** (`AGENTS.md`, `CLAUDE.md`) — informa o agente do
   protocolo antes de qualquer edição.
2. **Git hook local** (`.githooks/commit-msg`) — rejeita o commit na sua
   máquina antes mesmo de subir.
3. **CI** (`lock-check.yml`) — rejeita o merge no PR mesmo se o hook
   local foi pulado com `--no-verify`.

## Como funciona o bloqueio

- Arquivo **não listado** em `registry.yaml` → edição livre.
- Arquivo **listado** → somente leitura para agentes. Commits que o
  alterem são **rejeitados** pelo hook e pelo CI.
- A única forma de aceitar a alteração é incluir no commit message:

  ```
  [unlock:<feature-id>] motivo: <razão curta>
  ```

  Sem isso, o commit não passa. Com isso, fica registrado para sempre no
  `git log` — auditoria automática, sem arquivo extra para manter.

### Tipos de operacao

Cada lock pode declarar quais operacoes bloqueia:

```yaml
- id: exemplo
  description: Protege contrato publico
  operations: [add, modify, delete, rename]
  files:
    - backend/app/domain/contrato.py
```

Operacoes aceitas:

- `add` - criar/adicionar arquivo.
- `modify` - alterar arquivo existente.
- `delete` - remover arquivo.
- `rename` - renomear/mover arquivo.

Locks antigos sem `operations` continuam como lock total.

Arquivos em `.guia/locks/lock-ignore.txt` nunca devem ser travados. O projeto tambem tem o lock global `adicoes-exigem-autorizacao`, que bloqueia `add` em `*` para que toda adicao nova seja autorizada explicitamente.

## Setup inicial (uma vez)

Após clonar o repositório, rode:

```powershell
# 1. Aponta o git para os hooks versionados
git config core.hooksPath .githooks

# 2. Instala a dependência do script
pip install pyyaml

# 3. Sanity check
python bin/check-lock.py list
```

> O passo 1 é por clone (não fica em commit). Se você (ou outra pessoa)
> clonar o repo de novo, refaça.

## Adicionando uma trava

### Via CLI (recomendado)

```powershell
python bin/check-lock.py lock ingestao-livestream `
    --description "Download e parse de VTT da livestream" `
    backend/app/services/ingestao.py `
    backend/app/domain/vtt_parser.py
```

O script:
- Valida que a feature ainda não existe no registry.
- Avisa se algum arquivo não existe no repo (não bloqueia — útil para travar
  paths que serão criados em sequência).
- Grava `locked_at` com a data de hoje.
- Reescreve `registry.yaml` mantendo o cabeçalho.

### Manualmente

Abra `.guia/locks/registry.yaml` no editor e adicione:

```yaml
locks:
  - id: ingestao-livestream
    description: Download e parse de VTT da livestream
    locked_at: 2026-05-18
    files:
      - backend/app/services/ingestao.py
      - backend/app/domain/vtt_parser.py
```

Confira:

```powershell
python bin/check-lock.py list
```

## Editando arquivo travado (unlock temporário)

Este é o caminho normal quando você decidiu autorizar uma alteração
pontual em algo travado.

1. Faça a alteração (você ou o agente — o agente vai te pedir autorização
   antes de editar).
2. No commit, inclua a marca:

   ```
   fix: corrige timestamp negativo no parser de VTT

   [unlock:ingestao-livestream] motivo: bug em legenda inicial < 0
   ```

3. O hook valida e aceita. O CI também valida no PR.
4. O desbloqueio fica no `git log` — auditável para sempre.

Para destravar **múltiplas features** no mesmo commit, repita a marca:

```
fix: ajusta integração entre ingestão e export

[unlock:ingestao-livestream] motivo: novo campo no contrato
[unlock:export-losslesscut] motivo: consumir o novo campo
```

> **Importante:** o `unlock` é por commit, não por sessão. Se você faz
> 3 commits seguidos mexendo na mesma feature, cada um precisa da marca.
> Isso é proposital — força a justificar cada toque.

## Removendo uma trava permanentemente

Quando uma feature deixa de fazer sentido travar (ex.: você vai
reescrever do zero, ou ela foi descontinuada):

```powershell
python bin/check-lock.py unlock ingestao-livestream
```

Isso remove o bloco do `registry.yaml`. Diferente do unlock temporário,
**não exige marca em commit** — você está dizendo "essa feature não
precisa mais ser protegida".

Caso de uso normal é o **unlock temporário** (seção anterior). Remoção
permanente é raro.

## Auditando desbloqueios

```powershell
python bin/check-lock.py audit
```

Lista todos os commits que carregam `[unlock:...]` na mensagem:

```
Desbloqueios registrados:

  2026-05-18  a1b2c3d  fix: corrige timestamp negativo no parser de VTT
  2026-05-19  e4f5g6h  refactor: extrai validacao de URL do youtube
```

Para auditoria detalhada com corpo completo do commit:

```powershell
git log --grep "[unlock:" --fixed-strings --pretty=fuller
```

## Convenções

### Granularidade

Trave por **feature de negócio**, não por arquivo solto. Uma trava deve
agrupar tudo que compõe a funcionalidade:

- Serviço de domínio: `backend/app/services/<feature>.py`
- Utilitários de domínio relacionados: `backend/app/domain/<modulo>.py`
- Router que expõe a feature: `backend/app/routers/<feature>.py`
- Testes: `backend/tests/test_<feature>.py`
- Componente React que consome (se a UI for parte do contrato)

### Nomes (id)

- **kebab-case**, slug curto: `ingestao-livestream`, `export-losslesscut`.
- Use o vocabulário do domínio (`Ingestão`, `Export`, `Análise`, `Corte`).
- Evite nomes genéricos (`servico-backend`, `helper`, `util`) — falham em
  descrever o que está protegido.

### Quando travar

Trave quando:
- A feature foi **testada** (mesmo que com smoke test manual) e está em uso real.
- Não há bug aberto conhecido nela.
- Você não planeja iterar nela no curto prazo.

Não trave:
- Código em construção (mude livremente).
- Código que você sabe que vai refatorar essa semana.
- Configuração que muda demais (`.env`, `*.config.js`).
- Arquivos de migração de banco (são append-only por natureza).

## Casos especiais

### Refactor que atravessa uma feature travada

Se um refactor maior precisa mexer numa feature travada **e em outras
coisas**:

- Opção A (preferida): faça o refactor em PR separado, só com o necessário,
  usando unlock temporário.
- Opção B: aceite o unlock no PR maior, com motivo descritivo.

```
refactor: extrai cliente HTTP comum entre serviços

[unlock:ingestao-livestream] motivo: trocar requests por httpx
```

### Renomear ou mover arquivo travado

Tratado como edição. Use unlock temporário **e** atualize o registry:

```powershell
# 1. Faça o git mv e commit com [unlock:...]
git mv backend/app/services/ingestao.py backend/app/services/livestream_ingestao.py
git commit -m "refactor: renomeia ingestao para livestream_ingestao

[unlock:ingestao-livestream] motivo: nome mais especifico"

# 2. Atualize o registry para apontar para o novo caminho
python bin/check-lock.py unlock ingestao-livestream
python bin/check-lock.py lock ingestao-livestream `
    --description "Download e parse de VTT da livestream" `
    backend/app/services/livestream_ingestao.py `
    backend/app/domain/vtt_parser.py
```

### Adicionar arquivo novo a uma feature travada

A trava não impede criar arquivos novos em outros caminhos — então é
fácil um agente "estender" a feature por fora. O `AGENTS.md` proíbe
explicitamente esse comportamento (renomear, dividir, recriar lógica
equivalente noutro lugar).

Se você quer mesmo estender a feature, atualize o registry para incluir
o novo arquivo:

```powershell
python bin/check-lock.py unlock ingestao-livestream
python bin/check-lock.py lock ingestao-livestream `
    --description "Download e parse de VTT" `
    backend/app/services/ingestao.py `
    backend/app/domain/vtt_parser.py `
    backend/app/domain/vtt_validator.py    # novo
```

### Trava colidiu com algo que você esqueceu que existia

Acontece. Use `[unlock:<id>] motivo: ...` no commit e siga. A trava não é
camisa de força — é um pedido consciente de pausa para você confirmar que
sabe o que está mexendo.

### Emergência (não recomendado)

Para bypass total do hook local:

```powershell
git commit --no-verify -m "..."
```

Mas o **CI ainda vai pegar** no PR. Para realmente forçar, você
precisaria desabilitar a branch protection no GitHub — o que é deliberado
e visível no histórico.

## Troubleshooting

### "PyYAML não instalado"

```powershell
pip install pyyaml
```

### O hook não roda

Confira:

```powershell
git config --get core.hooksPath
# Deve imprimir: .githooks
```

Se vazio, instale:

```powershell
git config core.hooksPath .githooks
```

### O hook roda mas não bloqueia

Verifique se o arquivo `.githooks/commit-msg` está acessível e se o
`bin/check-lock.py` retorna erro 1 para um arquivo travado:

```powershell
python bin/check-lock.py check <arquivo-que-deveria-estar-travado>
echo $LASTEXITCODE   # esperado: 1
```

### CI passa mas eu queria que bloqueasse o merge

O workflow precisa estar listado em **Branch protection rules → Required
status checks** no GitHub. Sem isso, o CI roda mas o merge passa.

### Commitei sem `[unlock:...]` e o hook bloqueou

```powershell
git commit --amend
# editor abre, adicione a linha [unlock:<id>] motivo: ..., salve, feche
```

Se já tinha pushed e está num PR, simplesmente faça um novo commit com a
marca (ou amend + force-push se for o seu branch privado).
