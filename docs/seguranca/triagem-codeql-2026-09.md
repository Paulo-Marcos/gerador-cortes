# Triagem dos alertas do CodeQL — setembro de 2026

O CodeQL foi ligado em 28/09/2026 (D-797) e a primeira análise, sobre a `main`
da 0.4.0, levantou 112 alertas. Cada um foi confirmado ou refutado lendo o
código até o ponto sensível (skill `security-audit`, fase 5). Os refutados
ficam aqui **com o motivo**, para não serem "descobertos" de novo; no GitHub,
o alerta é dispensado citando esta página.

## Confirmados e corrigidos

| Alerta | Onde | Correção |
|---|---|---|
| `py/command-line-injection` (crítico, x2) | `services/ingestao.py` | D-807: a URL da live virava opção do yt-dlp (`--exec=...`). Agora é conferida na criação do projeto e reconstruída a partir do id, depois de `--` (`infrastructure/ytdlp.py`). |
| `actions/missing-workflow-permissions` (x6) | `ci.yml`, `lock-check.yml` | D-809: `permissions: contents: read` no topo; teste exige a chave em todo workflow. |

## Confirmado, gravidade baixa, correção depois da 0.5.0

| Alerta | Onde | Por que baixa |
|---|---|---|
| `py/incomplete-url-substring-sanitization` (x2) | `domain/publicacao/youtube_urls.py:24` | `host.endswith("youtube.com")` aceita `evilyoutube.com`. Nenhum código acessa esse host: a função devolve só o id de 11 caracteres (conferido por regex), e desde a D-807 o yt-dlp recebe a URL reconstruída. Correção: comparar o host por igualdade, como `domain/compartilhado/url_do_youtube.py`. O arquivo está travado (`publicacao-manual-upload-individual-estudio`): exige unlock do dono. |

## Refutados

| Alerta | Onde | Por que não é vulnerabilidade |
|---|---|---|
| `py/url-redirection` | `routers/projetos.py` (`video-proxy`) | O destino é `/videos/{projeto_id}/{arquivo}`, e o redirect só acontece depois de `obter_video_proxy_path` achar o projeto no banco; id inexistente dá 404. O parâmetro de caminho não aceita `/`, então não há como virar `//outro-host`. O destino é sempre um caminho do próprio servidor. |
| `py/url-redirection` | `routers/cortes.py` (bruto do corte) | Mesmo raciocínio: `bruto_do_corte.localizar(corte_id)` só devolve para corte existente; o destino é `/videos/{projeto}/cortes/{corte}/{arquivo}`. |
| `py/stack-trace-exposure` | `routers/shorts.py` (`erro_ao_abrir`) | Não é stack trace: é `str()` de `NaoConsegueAbrir`, exceção do próprio app com mensagem escrita por ele, devolvida à tela do operador na mesma máquina (o backend escuta só em 127.0.0.1). |

## `py/path-injection` (alto, x99) — D-811

Premissa verificada: um id vindo da URL não contém `/`, mas contém `..` e `\`
(chega como `%5C`), e `\` é separador no Windows; `C:%5C...` descarta a raiz
em `Path(raiz) / valor`. Provado num FastAPI mínimo à parte.

| Grupo (origem) | Qtde | Veredito | Por quê / correção |
|---|---|---|---|
| `corte_id` na URL (media_proxy, export, validação, youtube, fila do worker, log do render, bruto, corte, capa, thumbnail...) | 64 | refutado | Todo `Corte` nasce com `uuid4()` no servidor e nenhum schema aceita id; `db.get(Corte, corte_id)` aborta antes de qualquer caminho. |
| `projeto_id` na URL (ingestão, projeto, claude_ia, diarização) | 16 | refutado | Mesmo raciocínio: `db.get(Projeto, ...)` antes do caminho, em todas as rotas ou dentro do service. |
| `short_id` na URL (capa e render do short) | 4 | refutado | `db.get(Short)` e `db.get(Corte)` antes; a extensão da arte passa por lista branca. |
| `/videos/{projeto_id}/{filename:path}` (main.py) | 6 | refutado | `resolve()` + `is_relative_to` da raiz dos projetos: `..`, `\` e absoluto dão 403. |
| `body.id` ao criar canal | 5 | refutado | `id_de_canal_valido` (slug) depois do `strip()`. |
| **`canal_id` na URL (selecionar, editar)** | 2 | **confirmado → corrigido** | Não passava pelo slug: `..`/`..\..`/`C:\...` gravavam o ponteiro do canal ativo fora de `channels/`, e o boot seguinte lia banco e prompts de lá. Agora `_exigir_canal` aplica o slug, e o leitor do ponteiro no `core` ignora ponteiro fora do padrão (cobre um já gravado). |
| **`body.filtros` do processamento multiversão** | 2 | **confirmado → corrigido** | O nome do filtro virava pasta (`versoes/{filtro}`): criava pasta e gravava vídeo e `meta.json` em qualquer lugar gravável. Agora só filtro da lista `FILTROS_CINEMA` passa, antes de abrir o banco. |

Premissa de exposição: o `GuardaDeOrigemLocal` (`routers/seguranca_local.py`)
recusa Host não local e escrita vinda de origem não local; o backend escuta em
127.0.0.1. Os dois confirmados exigiam um processo local ou uma página em
`localhost` — gravidade baixa a média, corrigidos mesmo assim.

Vistos de passagem, fora das 99 (backlog): extensão livre no upload manual de
thumbnail (`services/thumbnail.py`, sem travessia, mas grava `.hta`/`.html`);
GETs com efeito colateral (proxy de áudio, waveform, props do Remotion Studio)
que a guarda de origem deixa passar — vetor de disponibilidade, não de caminho.
