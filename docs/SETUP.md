# Setup — CutCut

Guia para instalar o CutCut numa máquina **Windows** (a única plataforma suportada —
[ADR-0008](adr/0008-plataforma-windows.md)) e deixá-lo pronto para o primeiro canal.

> Este passo a passo foi seguido num clone limpo em 22/09/2026 (D-671). O que ele
> encontrou de errado está corrigido aqui.

---

## 1. Pré-requisitos

**Obrigatórios**

| Ferramenta | Versão | Onde |
|---|---|---|
| Python | 3.11+ (marque "Add to PATH") | https://python.org |
| Node.js | 20+ | https://nodejs.org |
| ffmpeg e ffprobe | recente, no PATH | https://ffmpeg.org/download.html |
| yt-dlp | recente, no PATH | https://github.com/yt-dlp/yt-dlp |
| git | qualquer | https://git-scm.com |

**Opcionais** — cada um libera uma parte do app

| Ferramenta | Libera |
|---|---|
| [Claude Code CLI](https://claude.ai/code) (`claude`) | IA pela sua assinatura do Claude |
| Chave da API da Anthropic | IA do Claude sem assinatura, cobrada por uso (ver abaixo) |
| Antigravity CLI (`agy`) | IA pela sua assinatura do Google |
| Google Chrome | publicação assistida no TikTok e no Instagram (experimental) |
| iGPU Intel com Quick Sync | render acelerado; sem ela o vídeo sai pela CPU (`libx264`) |

Sem nenhum CLI de IA nem chave de API o app funciona no **modo manual**: ele monta o
prompt e você cola a resposta de qualquer IA ([ADR-0004](adr/0004-provedores-de-ia-v2.md)).

**IA pela chave de API, sem assinatura.** Crie uma chave em
[console.anthropic.com](https://console.anthropic.com) e ponha no `backend\.env`:

```
IA_CLAUDE_TRANSPORTE=api
IA_ANTHROPIC_API_KEY=sk-ant-...
```

Reinicie o app. Os botões do Claude passam a gerar pela API, cobrando da conta da
chave; as skills do canal valem do mesmo jeito. O nome da variável é próprio de
propósito: um `ANTHROPIC_API_KEY` que outra ferramenta tenha deixado no ambiente não
liga a API.

Confira no terminal:

```powershell
python --version
node --version
ffmpeg -version
yt-dlp --version
```

---

## 2. Instalar

```powershell
git clone https://github.com/Paulo-Marcos/gerador-cortes.git
cd gerador-cortes
powershell -ExecutionPolicy Bypass -File bin\bootstrap.ps1
```

O bootstrap confere os pré-requisitos, cria `backend\.venv`, instala as dependências do
backend, roda `npm ci` no frontend e no renderer e cria o `backend\.env` a partir do
exemplo — **sem nunca sobrescrever** um `.env` que já exista. Rodar de novo é seguro.
Use `-Dev` para instalar também as dependências de teste.

<details>
<summary>O que o bootstrap faz, passo a passo (para quando algo falha no meio)</summary>

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env      # só se ainda não existir
cd ..\frontend
npm ci
cd ..\video-renderer
npm ci
```

O `dev.ps1` encontra o `backend\.venv` sozinho. Criar o venv importa: sem ele, todo clone
da máquina divide a mesma instalação de Python, e atualizar uma dependência num deles
mexe em todos.

</details>

---

## 3. Subir o app

```powershell
.\dev.ps1
```

Sobe os quatro serviços num terminal só e encerra tudo com `Ctrl+C`:

| Serviço | Endereço |
|---|---|
| Frontend | http://localhost:4300 |
| Backend (documentação da API em `/docs`) | http://localhost:8000 |
| Remotion Studio | http://localhost:3200 |
| Worker de render | processo em segundo plano |

Na primeira vez o `dev.ps1` baixa o Chrome Headless Shell que o Remotion usa (~110 MB).

**Não copie nada para `instance/`.** No primeiro boot o app cria a pasta sozinho, com um
canal pronto (`instance/channels/<canal>/`) e o ponteiro de canal ativo. O antigo passo
"`cp -r examples/instance.example/ instance/`" é desnecessário — e, rodado depois do
primeiro boot, espalha arquivos soltos num `instance/` que já foi migrado.

Portas ocupadas por outra instância do app? Copie `dev.ports.local.ps1.example` para
`dev.ports.local.ps1` e troque os números; o frontend acompanha a porta do backend.

---

## 4. Configurar o canal

Abra **http://localhost:4300** e vá em **Configurações**.

- **Aba Aplicação → Pré-requisitos:** o que a máquina tem e o que falta, item por item,
  dizendo o que cada opcional libera.
- **Aba Canal ativo:** edite a identidade do canal (nome, @handle, crédito), escolha o
  tema e abra as **Skills editoriais** — os prompts de cada etapa (análise, títulos,
  cenas, metadados, capa), com histórico e "restaurar o padrão". Crie mais canais em
  **Novo canal**.

Tudo isso fica no banco, por canal, e vale sem reiniciar
([ADR-0011](adr/0011-skills-editoriais-por-canal.md),
[ADR-0012](adr/0012-onde-vive-cada-configuracao.md)). Trocar de canal ativo, esse sim,
pede reiniciar o app.

> **Avançado:** alguns textos (crédito da descrição, prompts de thumbnail e a direção
> visual padrão das cenas) ainda vêm de um `canal_config.py`. Sem nenhum, o app usa o
> exemplo versionado. Para personalizar, crie `instance/channels/<canal>/canal_config.py`
> a partir de `backend/app/canal_config.py.example`.

---

## 5. Conectar o YouTube

Em **Configurações → Canal ativo**, abra **"Como conectar o YouTube"**. O tutorial do app
guia a criação do cliente OAuth no Google Cloud (uns 10 minutos, de graça), mostra o
caminho **exato** onde salvar o `client_secrets.json` e explica os erros comuns
(403, login expirando em 7 dias, cota diária).

- O `client_secrets.json` é o "crachá" do app no Google: **um por instalação**,
  compartilhado entre os canais.
- O login (`token.json`) é **por canal**: cada canal publica na própria conta.

---

## 6. Chaves no `backend\.env`

O `.env` guarda só **segredos**; o resto é configurado pela tela.

| Chave | Para quê | Obrigatória? |
|---|---|---|
| `YOUTUBE_API_KEY` | busca e ranking de lives (YouTube Data API) | para a busca |
| `GEMINI_API_KEY` | cenas, desvios e imagens de capa pela API do Gemini | não |
| `HUGGINGFACE_TOKEN` | diarização de falantes (ver abaixo) | não |

### Diarização de falantes (opcional)

Em vídeos de reação, a IA às vezes atribui ao dono do canal uma fala de outra pessoa.
A **diarização** rotula quem fala em cada trecho (`[CANAL]` × `[OUTRO]`), e você a liga
na hora da análise, no projeto. Sem configurar, tudo funciona — a transcrição só não
recebe o rótulo.

```powershell
# 1. Instale a dependência pesada (torch + pyannote) no venv do backend
cd backend
.venv\Scripts\python.exe -m pip install pyannote.audio
```

2. Crie um token **gratuito** em huggingface.co/settings/tokens — de preferência um token
   clássico com role "Read". Se usar um "fine-grained", marque *"Read access to contents
   of all public gated repos you can access"*.
3. Aceite os termos dos **dois** modelos: `pyannote/speaker-diarization-3.1` e
   `pyannote/segmentation-3.0`.
4. Preencha `HUGGINGFACE_TOKEN=hf_...` no `backend\.env`.

> Erro "cannot find the requested files … check your connection"? Quase nunca é
> conexão: é um **403** (token sem acesso a repositórios gated, ou termos não aceitos).
> A causa sai no log do backend (`[Diarizacao] Causa provável: …`). Sem GPU, a
> diarização roda na CPU, mais devagar.

---

## 7. Atualizar sem perder dados

Os dados de cada canal vivem em `instance/`, que o git ignora: um `git pull` não os toca.
Antes de atualizar, rode o guarda-corpo, que confere isso:

```powershell
python bin\check_update_safety.py      # faz também o preview do que o pull traz
git pull
```

Saída `0` = seguro. Qualquer outra = algum dado seria versionado ou tocado: **não
atualize** até corrigir. Por garantia, faça backup antes da pasta
`instance\channels\<canal>\` e do `instance\settings.db` — juntos eles são o canal
inteiro ([ADR-0005](adr/0005-persistencia-multicanal.md)).

Se você mudou `.claude/settings.json` localmente e o `git pull` reclamar de conflito,
guarde a sua versão, atualize e reaplique.

---

## 8. Rodar cada serviço separado

```powershell
# Backend
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --reload

# Frontend
cd frontend
npm run dev

# Remotion Studio
cd video-renderer
npm run dev

# Worker de render (necessário para renderizar)
cd video-renderer
node native_worker.js
```

**Um processo de backend só**: nada de `--workers 2`. O app tem um escritor único por
banco e tarefas em segundo plano no próprio processo
([ADR-0005](adr/0005-persistencia-multicanal.md)).

Problemas conhecidos: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
