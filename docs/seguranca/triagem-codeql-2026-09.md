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

## Em triagem

- `py/path-injection` (alto, x99): D-811.
