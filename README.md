# CutCut ✂️

[![CI](https://github.com/Paulo-Marcos/gerador-cortes/actions/workflows/ci.yml/badge.svg)](https://github.com/Paulo-Marcos/gerador-cortes/actions/workflows/ci.yml)

> CutCut leva uma live do YouTube até o corte publicado: baixa, transcreve, propõe os
> cortes com IA, e entrega o vídeo renderizado com cenas, capa e texto de publicação —
> para você revisar, ajustar e publicar no YouTube, no TikTok e no Instagram, com
> shorts verticais tirados dos mesmos cortes.

## Para quem é

Para quem mantém um canal de **cortes de lives** e quer tirar da mão o trabalho repetitivo
(achar os trechos, limpar silêncios, montar capa e descrição, renderizar, publicar) sem
abrir mão da decisão editorial. O app roda **na sua máquina**, com os seus canais, e usa
a **sua** assinatura de IA — não é um serviço na nuvem.

## O que ele faz

- **Vários canais numa instalação**, cada um com identidade, tema, mascote, conta do
  YouTube e voz editorial próprios.
- **Encontra lives** para cortar: busca e ranking por visualizações por hora e recência.
- **Baixa e transcreve** a live (legenda do YouTube ou transcrição local).
- **A IA propõe os cortes**, com título, gancho e contextualização; você aprova, ajusta as
  bordas, tira silêncios e trechos, reordena e divide ou junta cortes.
- **Pós-produção**: cenas animadas (Remotion), layout com tela cheia ou compartilhada e
  filtro de cor, com prévia ao vivo.
- **Metadados e capa**: título, descrição, capítulos, tags e prompt de thumbnail gerados
  por IA, com molduras por canal.
- **Render** acelerado pela iGPU Intel (QSV) quando disponível, com reserva em CPU.
- **Publica** no YouTube (API oficial) e, de forma **assistida e experimental**, no TikTok
  e no Instagram ([ADR-0009](docs/adr/0009-publicacao-assistida-experimental.md)).
- **Shorts verticais** a partir dos cortes: segmentos, palco 9:16, gancho de abertura,
  legenda queimada e capa.
- **Limpeza do disco com regra**: o vídeo final só é apagado depois de publicado em
  todos os destinos, e o corte marcado como Fire com shorts pendentes fica guardado
  ([regras RN-15 e RN-16](docs/dominio/regras-de-negocio.md)).

## Plataforma

**Windows é a única plataforma suportada** ([ADR-0008](docs/adr/0008-plataforma-windows.md)).
Linux, macOS e Docker não são suportados.

## Pré-requisitos

**Obrigatórios**

- [Python 3.11+](https://www.python.org/) (marque "Add to PATH")
- [Node.js 20+](https://nodejs.org/)
- [ffmpeg e ffprobe](https://ffmpeg.org/) no PATH
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) no PATH

**Opcionais** (cada um libera uma parte do app)

| Ferramenta | Para quê |
|---|---|
| [Claude Code CLI](https://claude.ai/code) | IA pela sua assinatura do Claude |
| Antigravity CLI (`agy`) | IA pela sua assinatura do Google |
| Credencial do Google Cloud (`client_secrets.json`) | publicar no YouTube |
| Chave da API do Gemini | cenas, desvios e imagens de capa |
| Google Chrome | publicação assistida no TikTok e no Instagram |

Sem nenhum CLI de IA o app funciona no **modo manual**: ele monta o prompt, você cola a
resposta de qualquer IA ([ADR-0004](docs/adr/0004-provedores-de-ia-v2.md)).

A tela de **Canais** mostra o que está faltando na sua máquina, item por item.

## Instalação

```powershell
git clone https://github.com/Paulo-Marcos/gerador-cortes.git
cd gerador-cortes
powershell -ExecutionPolicy Bypass -File bin\bootstrap.ps1
```

O bootstrap confere os pré-requisitos, cria o ambiente Python do backend, instala as
dependências do frontend e do renderer e cria o `backend/.env` a partir do exemplo.
Pode rodar de novo quando quiser: nunca sobrescreve um `.env` existente.

Para subir tudo (backend, frontend, Remotion Studio e o worker de render):

```powershell
.\dev.ps1
```

Abra **http://localhost:4300**. O passo a passo completo, com a credencial do YouTube e
os CLIs de IA, está em [docs/SETUP.md](docs/SETUP.md). Problemas conhecidos:
[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Primeiros passos

1. Em **Canais**, crie o seu canal (nome, @handle, crédito) e confira os pré-requisitos.
2. Em **Buscar lives** ou **Ranking**, escolha uma live, ou cole a URL dela.
3. O app baixa e transcreve. Depois, peça à IA que proponha os cortes.
4. No **editor de cortes**, aprove, ajuste as bordas e tire os trechos que não servem.
5. Na **pós-produção**, confira as cenas e o layout; gere os **metadados** e a capa.
6. Na **revisão final**, renderize; em **Exportar**, publique. Os melhores cortes viram
   **shorts**.

Atualizar: `git pull`, depois de rodar `python bin/check_update_safety.py`, que confere
que nada dos seus dados será tocado
([ADR-0010](docs/adr/0010-distribuicao-e-atualizacao.md)).

## Documentação

| Para | Leia |
|---|---|
| Instalar e configurar | [docs/SETUP.md](docs/SETUP.md) |
| Entender o domínio | [mapa de contextos](docs/dominio/mapa-de-contextos.md), [glossário](docs/dominio/glossario.md), [regras de negócio](docs/dominio/regras-de-negocio.md) |
| Entender as decisões | [ADRs](docs/adr/README.md) |
| Contribuir | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Trabalhar com um agente de IA | [AGENTS.md](AGENTS.md) |
| O que mudou em cada versão | [CHANGELOG.md](CHANGELOG.md) |

## Licença

[GPL-3.0](LICENSE).
