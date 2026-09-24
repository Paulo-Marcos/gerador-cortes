"""D-305: agregações puras do desempenho dos vídeos publicados no canal.

Sem I/O — recebe listas de dicts (uma por vídeo, já lidas do banco pelo service)
e devolve os levantamentos que calibram os próximos cortes:

- **duração × retenção**: agrupa por faixa de duração (as mesmas do plano V2 —
  5/8–18/30) e mede retenção média e views por faixa.
- **título × desempenho**: cruza comprimento do título (alvo 55–60 chars) e a
  presença de dois-pontos/pergunta/número com views e retenção.

Também vivem aqui o parsing de duração ISO8601 (Data API) e a normalização de
título usada no casamento vídeo↔corte, porque são regras de domínio reutilizadas
pela infra, pelo service e pelos testes.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata

# Faixas de duração (minutos) — espelham as bordas do plano V2 de cortes
# (docs/interno/melhoria-cortes/plano-v2-cortes.md: mínimo 5/8, máximo 18/30). Intervalos
# semiabertos [lo, hi) para não contar um vídeo em duas faixas.
BUCKETS_DURACAO: list[tuple[str, float, float]] = [
    ("<5", 0.0, 5.0),
    ("5-8", 5.0, 8.0),
    ("8-12", 8.0, 12.0),
    ("12-18", 12.0, 18.0),
    ("18-30", 18.0, 30.0),
    (">30", 30.0, float("inf")),
]

# Faixas de comprimento do título (em caracteres). A faixa 55-60 é o alvo do
# plano V2; as vizinhas existem para mostrar o custo de sair dela.
BUCKETS_TITULO_LEN: list[tuple[str, int, int]] = [
    ("<40", 0, 40),
    ("40-54", 40, 55),
    ("55-60", 55, 61),
    ("61-70", 61, 71),
    (">70", 71, 10**9),
]

_DURACAO_ISO_RE = re.compile(
    r"^P(?:(?P<dias>\d+)D)?T(?:(?P<horas>\d+)H)?(?:(?P<min>\d+)M)?(?:(?P<seg>\d+)S)?$"
)

COLUNAS_CSV_DURACAO = [
    "faixa",
    "videos",
    "views_total",
    "views_media",
    "retencao_media_pct",
    "retencao_ponderada_pct",
    "avg_view_duration_media_seg",
]

COLUNAS_CSV_TITULO = [
    "grupo",
    "faixa",
    "videos",
    "views_total",
    "views_media",
    "retencao_media_pct",
    "retencao_ponderada_pct",
]


def parsear_duracao_iso8601(iso: str) -> float:
    """Converte a duração ISO8601 da Data API (`PT1H2M3S`) em segundos.

    Vazio, `None` ou formato inesperado → 0.0 (nunca levanta: um vídeo sem
    duração legível não deve derrubar o levantamento inteiro).

    Exemplo:
        >>> parsear_duracao_iso8601("PT1H2M3S")
        3723.0
        >>> parsear_duracao_iso8601("PT15M")
        900.0
    """
    if not iso:
        return 0.0
    match = _DURACAO_ISO_RE.match(iso.strip())
    if not match:
        return 0.0
    dias = int(match.group("dias") or 0)
    horas = int(match.group("horas") or 0)
    minutos = int(match.group("min") or 0)
    segundos = int(match.group("seg") or 0)
    return float(dias * 86400 + horas * 3600 + minutos * 60 + segundos)


def bucket_duracao(seg: float) -> str:
    """Rótulo da faixa de duração de um vídeo (segundos → faixa em minutos)."""
    minutos = (seg or 0.0) / 60.0
    for rotulo, lo, hi in BUCKETS_DURACAO:
        if lo <= minutos < hi:
            return rotulo
    return ">30"


def bucket_titulo_len(comprimento: int) -> str:
    """Rótulo da faixa de comprimento (nº de caracteres) de um título."""
    for rotulo, lo, hi in BUCKETS_TITULO_LEN:
        if lo <= comprimento < hi:
            return rotulo
    return ">70"


def normalizar_titulo(titulo: str) -> str:
    """Normaliza um título para casamento vídeo↔corte.

    Remove acentos e emojis (o 🔥 do padrão editorial some), rebaixa para
    caixa-baixa, descarta pontuação e colapsa espaços. Dois títulos que só
    diferem em acento/emoji/pontuação passam a comparar iguais.

    Exemplo:
        >>> normalizar_titulo("🔥 A Crise: por quê?")
        'a crise por que'
    """
    if not titulo:
        return ""
    nfkd = unicodedata.normalize("NFKD", titulo)
    sem_acento = "".join(c for c in nfkd if not unicodedata.combining(c))
    somente_alnum = re.sub(r"[^0-9a-z\s]", " ", sem_acento.casefold())
    return re.sub(r"\s+", " ", somente_alnum).strip()


def levantamento_duracao_retencao(videos: list[dict]) -> list[dict]:
    """Uma linha por faixa de duração (ordem canônica, faixas vazias incluídas).

    Cada `video`: `duracao_seg`, `views`, `average_view_percentage`,
    `average_view_duration_seg`. Faixas vazias entram zeradas para a tabela ficar
    estável entre syncs.
    """
    por_faixa: dict[str, list[dict]] = {rotulo: [] for rotulo, _, _ in BUCKETS_DURACAO}
    for video in videos:
        por_faixa[bucket_duracao(float(video.get("duracao_seg") or 0.0))].append(video)

    linhas: list[dict] = []
    for rotulo, _, _ in BUCKETS_DURACAO:
        agregado = _agregar(por_faixa[rotulo])
        linhas.append({"faixa": rotulo, **agregado})
    return linhas


def levantamento_titulo_desempenho(videos: list[dict]) -> list[dict]:
    """Linhas de título×desempenho, agrupadas por comprimento e por característica.

    `grupo` ∈ {comprimento, dois_pontos, pergunta, numero}; `faixa` é a faixa de
    comprimento (grupo comprimento) ou "com"/"sem" (demais grupos). Um vídeo entra
    em exatamente uma faixa de cada grupo.
    """
    por_comprimento: dict[str, list[dict]] = {rotulo: [] for rotulo, _, _ in BUCKETS_TITULO_LEN}
    caracteristicas = {
        "dois_pontos": {"com": [], "sem": []},
        "pergunta": {"com": [], "sem": []},
        "numero": {"com": [], "sem": []},
    }

    for video in videos:
        titulo = str(video.get("titulo") or "")
        por_comprimento[bucket_titulo_len(len(titulo))].append(video)
        caracteristicas["dois_pontos"]["com" if ":" in titulo else "sem"].append(video)
        caracteristicas["pergunta"]["com" if "?" in titulo else "sem"].append(video)
        caracteristicas["numero"]["com" if re.search(r"\d", titulo) else "sem"].append(video)

    linhas: list[dict] = []
    for rotulo, _, _ in BUCKETS_TITULO_LEN:
        linhas.append(
            {"grupo": "comprimento", "faixa": rotulo, **_agregar(por_comprimento[rotulo])}
        )
    for grupo, presencas in caracteristicas.items():
        for faixa in ("com", "sem"):
            linhas.append({"grupo": grupo, "faixa": faixa, **_agregar(presencas[faixa])})
    return linhas


def csv_duracao_retencao(linhas: list[dict]) -> str:
    return _to_csv(linhas, COLUNAS_CSV_DURACAO)


def csv_titulo_desempenho(linhas: list[dict]) -> str:
    return _to_csv(linhas, COLUNAS_CSV_TITULO)


# ── internos ────────────────────────────────────────────────────────────────


def _agregar(videos: list[dict]) -> dict:
    """Estatísticas de um grupo de vídeos: contagem, views e retenção.

    `retencao_media_pct` é a média simples do averageViewPercentage; a
    `retencao_ponderada_pct` pondera pelo nº de views (sinal mais fiel, já que
    um vídeo com 5 views não deve pesar como um com 5000).
    """
    n = len(videos)
    if n == 0:
        return {
            "videos": 0,
            "views_total": 0,
            "views_media": 0.0,
            "retencao_media_pct": 0.0,
            "retencao_ponderada_pct": 0.0,
            "avg_view_duration_media_seg": 0.0,
        }

    views = [int(v.get("views") or 0) for v in videos]
    retencoes = [float(v.get("average_view_percentage") or 0.0) for v in videos]
    duracoes = [float(v.get("average_view_duration_seg") or 0.0) for v in videos]
    views_total = sum(views)
    ponderada = (
        sum(ret * w for ret, w in zip(retencoes, views, strict=True)) / views_total
        if views_total
        else 0.0
    )
    return {
        "videos": n,
        "views_total": views_total,
        "views_media": round(views_total / n, 1),
        "retencao_media_pct": round(sum(retencoes) / n, 2),
        "retencao_ponderada_pct": round(ponderada, 2),
        "avg_view_duration_media_seg": round(sum(duracoes) / n, 1),
    }


def _to_csv(linhas: list[dict], colunas: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=colunas, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    for linha in linhas:
        writer.writerow(linha)
    return buffer.getvalue()
