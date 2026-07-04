# Setup — CortadorLive

Guia para quem clona o repositório e quer rodar o projeto localmente.

---

## Pré-requisitos

Instale antes de continuar:

| Ferramenta | Versão mínima | Link |
|-----------|--------------|------|
| Python | 3.11+ | https://python.org |
| Node.js | 20+ | https://nodejs.org |
| ffmpeg | qualquer recente | https://ffmpeg.org/download.html |
| yt-dlp | qualquer recente | https://github.com/yt-dlp/yt-dlp |
| Claude Code CLI | qualquer recente | https://claude.ai/code |

Verifique que `ffmpeg`, `yt-dlp` e `claude` estão no PATH:

```bash
ffmpeg -version
yt-dlp --version
claude --version
```

O **Claude CLI** é o provedor de IA do projeto: ele faz a análise de transcrição (proposta de
cortes), os metadados, os desvios e o resumo, usando a sua assinatura do Claude. A implementação
está em `backend/app/services/claude_ia.py` e `backend/app/infrastructure/claude_cli_client.py`.

---

## 1. Clonar e instalar dependências

```bash
git clone https://github.com/seu-usuario/gerador-cortes.git
cd gerador-cortes
```

### Backend (Python)

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
```

### Frontend (React)

```bash
cd frontend
npm install
```

### Remotion + Worker (Node.js)

```bash
cd video-renderer
npm install
```

> **Chrome Headless Shell do Remotion (obrigatório após `npm ci`/`npm install`).**
> No Node 24 o `extract-zip` do Remotion pode falhar em silêncio e deixar renders sem gerar
> arquivo. Veja o problema e o fix em
> [Troubleshooting → Chrome Headless Shell do Remotion](TROUBLESHOOTING.md#chrome-headless-shell-do-remotion-não-extrai-node-24).

---

## 2. Configurar variáveis de ambiente do backend

```bash
# A partir da raiz do projeto
cp backend/.env.example backend/.env
```

Abra `backend/.env` e preencha as chaves necessárias:

```dotenv
# Claude CLI — provedor de IA (análise, metadados, desvios, resumo)
# Já vem habilitado por padrão; ajuste só se o binário não estiver no PATH.
CLAUDE_CLI_ENABLED=true
# CLAUDE_CLI_PATH=claude
# CLAUDE_CLI_TIMEOUT=600

# Gemini — necessário para geração de thumbnails e cenas
GEMINI_API_KEY=sua-chave-do-google-ai-studio

# Diretórios (os defaults já funcionam para desenvolvimento local)
PROJETOS_DIR=./projetos
ASSETS_DIR=./assets
```

> A identidade do canal (handle/nome/crédito) e o canal-fonte das lives **não** são configurados
> aqui — ficam em `instance/channel.yaml` (veja a seção
> [Configuração do Canal](#configuração-do-canal) mais abaixo).

> Para uso em produção, copie `backend/.env.production.example` em vez do `.env.example` e ajuste as variáveis de host/URL conforme seu ambiente.

---

## 3. Criar a pasta `instance/` (identidade do canal)

`instance/` guarda os dados exclusivos da sua instalação: configuração do canal (`channel.yaml`),
prompts editoriais, mascote e banco de dados local. Ela é **ignorada pelo git** — um `git pull`
nunca vai sobrescrever nem conflitar com esses arquivos.

Use o template versionado como ponto de partida:

```bash
# Na raiz do projeto
cp -r examples/instance.example/ instance/
```

Edite `instance/channel.yaml` com as informações do seu canal — handle, nome, crédito, paleta e
canal-fonte das lives (veja a seção [Configuração do Canal](#configuração-do-canal) mais abaixo
para o detalhe de cada campo) — e popule as subpastas conforme necessário.

---

## 4. Configurar o conteúdo do seu canal

`canal_config.py` contém os prompts editoriais do canal: geração de metadados, thumbnails e direção de cenas. O arquivo é ignorado pelo git para que cada instância use sua própria identidade.

```bash
cp backend/app/canal_config.py.example backend/app/canal_config.py
```

Abra `backend/app/canal_config.py` e substitua:

- `CREDITOS_TEMPLATE` — texto de créditos ao criador original que aparece na descrição do vídeo
- `PROMPT_GERAR_METADADOS` — prompt de redação editorial para título, texto de capa, sinopse e hashtags
- `PROMPT_GERAR_THUMBNAIL` — prompt de geração de thumbnails
- `PROMPT_DIRECAO` — direção visual das cenas do vídeo (personagem mascote, paleta, tipos de card)

O arquivo `canal_config.py.example` contém um exemplo completo de um canal de análise política e filosófica. Use-o como referência e adapte para o nicho, tom e mascote do seu canal.

---

## 5. Configurar o frontend (opcional)

O frontend funciona sem configuração adicional em desenvolvimento local. Se quiser personalizar:

```bash
cp frontend/.env.example frontend/.env.local
```

Edite `frontend/.env.local`:

```dotenv
VITE_API_URL=http://localhost:8000/api   # aponte para o backend
```

> Identidade do canal (handle/nome) não é configurada aqui — vem de `instance/channel.yaml` via
> a API do backend.

---

## 6. (Opcional) Configurar skills do Claude CLI

A geração de IA roda pelo Claude CLI. As skills em `examples/skills/` são exemplos de prompts editoriais estruturados que refinam essa geração.

Para usar:

1. Instale o Claude Code CLI: https://claude.ai/code
2. Copie ou crie suas próprias skills em `.claude/skills/`
3. Adapte os prompts ao nicho do seu canal

> As skills de exemplo são de um canal de análise política e filosófica brasileiro. Trate-as como referência de estrutura, não como conteúdo pronto para o seu canal.

---

## 7. Iniciar os serviços

### Windows — tudo de uma vez (recomendado)

```powershell
.\dev.ps1
```

O script inicia os quatro serviços em um único terminal com saída multiplexada e encerra tudo com `Ctrl+C`.

### Individualmente

```bash
# Backend
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm run dev

# Remotion Studio
cd video-renderer
npm run dev

# Worker de render (necessário para exportar vídeos)
cd video-renderer
node native_worker.js
```

---

## Serviços disponíveis

| Serviço | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| Documentação da API | http://localhost:8000/docs |
| Frontend | http://localhost:4300 |
| Remotion Studio | http://localhost:3000 |

---

## Configuração do Canal

Esta seção consolida todos os pontos de configuração que definem a identidade do canal na sua instância do CortadorLive.

---

### Identidade do canal — `instance/channel.yaml`

O `channel.yaml` do canal ativo é a **única fonte de identidade**: handle, nome, crédito e paleta.
Não existe mais configuração de identidade em variáveis de ambiente — nem no backend
(`backend/.env`), nem no frontend (`frontend/.env.local`). Veja
[`examples/instance.example/channel.yaml`](../examples/instance.example/channel.yaml) como
referência de campos:

```yaml
handle: "@meupodcast"
nome: "Meu Podcast de História"
credito: "@meupodcast"

# Canal-FONTE das lives: o canal do YouTube de onde o ranking baixa as
# livestreams. Aceita @handle, id UCxxxx ou username.
youtube_channel_id: ""

paleta:
  primaria: "#1a1a2e"
  secundaria: "#16213e"
  acento: "#0f3460"
```

| Campo | Onde aparece |
|-------|-------------|
| `handle` | Prompts de metadados e thumbnails |
| `nome` | Interface e logs internos |
| `credito` | Texto de crédito ao criador original nas descrições dos vídeos |
| `youtube_channel_id` | Canal-fonte que o ranking de lives varre |
| `paleta` | Cores usadas nas cenas e overlays gerados |

Edite `instance/channel.yaml` diretamente (veja a seção [Pasta `instance/` — dados locais do
canal](#pasta-instance--dados-locais-do-canal) para criar o arquivo) ou use a UI de Canais no
frontend, que lê e grava por `identidade_do_canal_ativo()`.

---

### Prompts editoriais — `canal_config.py`

`canal_config.py` é onde mora a identidade editorial do canal: persona do redator, estilo de título, direção visual das cenas e geração de thumbnails. O arquivo é gitignored por design — cada instância mantém o seu próprio, sem depender do repositório central.

Para configurar:

```bash
cp backend/app/canal_config.py.example backend/app/canal_config.py
```

Edite as quatro constantes do arquivo:

| Constante | O que controla |
|-----------|---------------|
| `CREDITOS_TEMPLATE` | Texto de créditos ao criador original inserido em cada descrição |
| `PROMPT_GERAR_METADADOS` | Persona e regras do redator editorial (título, sinopse, hashtags) |
| `PROMPT_GERAR_THUMBNAIL` | Prompt de geração de thumbnail: personagem, paleta, estilo visual |
| `PROMPT_DIRECAO` | Direção visual das cenas: mascote, tipos de card, tipografia |

O `canal_config.py.example` contém um exemplo completo e funcional — use-o como ponto de partida e refine ao longo do tempo.

---

### Skills do Claude CLI (opcional)

Com o Claude CLI como provedor de IA (`CLAUDE_CLI_ENABLED=true`, default), a pasta `examples/skills/` contém exemplos de skills editoriais estruturadas do canal de referência — mostrando o nível de detalhe esperado.

Para adaptar ao seu canal:

1. Crie suas versões em `.claude/skills/`
2. Ajuste os prompts ao nicho, tom e vocabulário do seu canal

> Esta etapa é avançada e opcional. O projeto funciona sem skills customizadas; os prompts em `canal_config.py` já cobrem os principais fluxos de geração.

---

## Produção

Para deploy em servidor, use `backend/.env.production.example` como base e ajuste:

- `PROJETOS_DIR` e `ASSETS_DIR` — caminhos absolutos no servidor
- Confirme que o binário `claude` está disponível no PATH do processo do backend (o Claude CLI roda nativo, não no Docker)
- Configure um proxy reverso (nginx, Caddy) para expor backend e frontend

O frontend em produção é um build estático:

```bash
cd frontend
npm run build
# serve o diretório dist/ com qualquer servidor de arquivos estáticos
```

---

## Atualizar sem perder dados

Antes de publicar na DEV e **antes de todo `git pull` na PROD**, rode o guard-rail — ele confirma que a atualização não versiona nem sobrescreve dado de produção (`instance/`, `projetos.db`, mídias):

```bash
# Na PROD, antes do pull (faz preview do delta origin/main):
python bin/check_update_safety.py

# Na DEV, sem rede / antes de publicar:
python bin/check_update_safety.py --no-fetch
```

Exit `0` = seguro. Exit `!= 0` = algum dado de produção seria versionado/tocado — **não atualize** até corrigir. Aceita `--remote <nome>` e `--branch <nome>` (default `origin main`). Faça backup de `instance/channels/<canal>/projetos.db` antes do pull.

---

## Atualizar um clone de produção sem conflito

`.guia/` (histórico de demandas do Guia Fluxo) e `.claude/settings.json` (configurações do Claude CLI) são **versionados no repositório de desenvolvimento** — é assim que preservamos o histórico de tarefas e as regras do projeto. Num clone de produção esses caminhos mudam localmente (tarefas encerradas, ajustes de configuração), e o `git pull` começa a reclamar de conflitos.

A solução é ignorá-los **apenas no clone de produção**, sem tocar no `.gitignore` do repositório nem remover os arquivos do histórico git.

### Passo 1 — Adicionar ao exclude local do clone

`.git/info/exclude` funciona como um `.gitignore` privado do clone — não é versionado e não afeta outros clones:

```bash
# Execute dentro do clone de produção
echo ".guia/" >> .git/info/exclude
echo ".claude/settings.json" >> .git/info/exclude
```

> Copie o conteúdo pronto de `examples/prod-git-exclude.txt` se preferir.

### Passo 2 — Marcar com `skip-worktree` (se já houver alterações locais rastreadas)

Se o git já estiver mostrando esses caminhos como modificados no clone de produção, marque-os com `skip-worktree` para que ele os ignore durante pulls e merges:

```bash
# Arquivo único
git update-index --skip-worktree .claude/settings.json

# Diretório inteiro
git ls-files .guia/ | xargs git update-index --skip-worktree
```

### Verificar que os arquivos continuam versionados no dev

Execute no **clone de desenvolvimento** para confirmar que nada foi de-versionado:

```bash
git ls-files .guia | head
git ls-files .claude/settings.json
# Ambos devem listar arquivos — se retornarem vazio, algo deu errado
```

### Desfazer o `skip-worktree` (quando precisar receber uma atualização do upstream)

```bash
git update-index --no-skip-worktree .claude/settings.json
git ls-files .guia/ | xargs git update-index --no-skip-worktree
# Depois: git pull (resolva conflitos normalmente) e remarca com skip-worktree se quiser
```

---

## Pasta `instance/` — dados locais do canal

`instance/` guarda os dados exclusivos da sua instalação: configuração do canal (`channel.yaml`), prompts editoriais, mascote e banco de dados local. Ela é **ignorada pelo git** — um `git pull` nunca vai sobrescrever nem conflitar com esses arquivos.

> A criação inicial da pasta (`cp -r examples/instance.example/ instance/`) fica no
> [passo 3](#3-criar-a-pasta-instance-identidade-do-canal) do guia, logo após configurar as
> variáveis de ambiente do backend.

### Por que não vai conflitar num `git pull`

O `.gitignore` exclui toda a árvore `instance/`. Mesmo que o repositório upstream mude estrutura ou adicione novos arquivos ao template (`examples/instance.example/`), a sua `instance/` local fica intocada:

```bash
# Verificar que instance/ não está rastreada
git ls-files instance/
# Deve retornar vazio — se retornar arquivos, algo deu errado

# Verificar que o template continua versionado (não deve ser ignorado)
git ls-files examples/instance.example/
# Deve listar os arquivos do template
```

### Receber uma atualização do upstream (fluxo completo)

```bash
# 1. Atualiza o código (instance/ fica intacta — ignorada pelo git)
git pull

# 2. Se o template tiver novidades, aplique manualmente o que for relevante
diff examples/instance.example/channel.yaml instance/channel.yaml

# 3. Confira que seus dados locais estão ok
ls instance/
```
