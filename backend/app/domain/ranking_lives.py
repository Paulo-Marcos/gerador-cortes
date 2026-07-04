"""Domain puro de ranking de lives candidatas (F-052).

Pontua uma lista de lives ainda não baixadas a partir de sinais coletados
(views, likes, comentários, sentimento dos comentários, recência da
publicação). Sem I/O: recebe os números, devolve a pontuação.

A normalização é por LOTE — cada candidata é comparada apenas com as
outras candidatas do mesmo ranking. Assim views absolutas não dominam
o score quando todo o canal é "pequeno" e o sinal real é o engajamento
relativo.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True)
class PesosRanking:
    """Soma livre — não precisa fechar em 1.0; o resultado normaliza para 0-100."""

    views: float = 0.15
    likes_por_view: float = 0.10
    comentarios_por_view: float = 0.15
    sentimento: float = 0.35
    recencia: float = 0.25


@dataclass(frozen=True)
class SinaisLive:
    """Sinais brutos coletados de uma live. tz-aware obrigatório em `data_publicacao`."""

    video_id: str
    views: int
    likes: int
    comentarios: int
    sentimento_0a10: float
    data_publicacao: datetime


@dataclass(frozen=True)
class LivePontuada:
    video_id: str
    pontuacao_total: float
    componentes: dict[str, float]


def calcular_recencia(
    data_publicacao: datetime,
    hoje: datetime,
    meia_vida_dias: float = 90.0,
) -> float:
    """Decay exponencial.

    Hoje = 1.0; após `meia_vida_dias` = 0.5; ~1 ano (com meia-vida 90) ≈ 0.06.
    Datas no futuro (input inconsistente) saturam em 1.0.
    """
    if meia_vida_dias <= 0:
        raise ValueError("meia_vida_dias deve ser > 0")
    delta_dias = (hoje - data_publicacao).total_seconds() / 86_400.0
    if delta_dias <= 0:
        return 1.0
    return float(0.5 ** (delta_dias / meia_vida_dias))


def normalizar_minmax(valor: float, minimo: float, maximo: float) -> float:
    """Mapeia `valor` para [0, 1] dentro do intervalo [minimo, maximo].

    Quando min == max (lote uniforme em um sinal), devolve 0.5 para não
    penalizar nem premiar — o sinal simplesmente não diferencia.
    """
    if maximo <= minimo:
        return 0.5
    razao = (valor - minimo) / (maximo - minimo)
    if razao < 0.0:
        return 0.0
    if razao > 1.0:
        return 1.0
    return razao


# Singleton imutável (PesosRanking é frozen): default lido de variável de módulo evita B008.
PESOS_PADRAO = PesosRanking()


def pontuar_lote(
    sinais: Iterable[SinaisLive],
    pesos: PesosRanking = PESOS_PADRAO,
    hoje: datetime | None = None,
) -> list[LivePontuada]:
    """Pontua um lote: normaliza dentro do batch e combina via pesos.

    - Views entram em escala log (compensa a cauda longa de canais com
      um vídeo viral e o resto baixo).
    - Likes e comentários entram como TAXA por view (engajamento
      relativo, não absoluto) — alinhado com a regra de negócio do operador
      ("vídeo com poucas views mas assunto ótimo").
    - Sentimento (0-10) é mapeado direto para 0-1.
    - Recência via decay exponencial.

    Retorna na mesma ordem de entrada, com `pontuacao_total` em 0-100.
    """
    sinais_lista = list(sinais)
    if not sinais_lista:
        return []
    hoje = hoje or datetime.now(UTC)

    views_log = [math.log1p(max(0, s.views)) for s in sinais_lista]
    likes_taxa = [(s.likes / s.views) if s.views > 0 else 0.0 for s in sinais_lista]
    comm_taxa = [(s.comentarios / s.views) if s.views > 0 else 0.0 for s in sinais_lista]

    v_min, v_max = min(views_log), max(views_log)
    l_min, l_max = min(likes_taxa), max(likes_taxa)
    c_min, c_max = min(comm_taxa), max(comm_taxa)

    peso_total = (
        pesos.views
        + pesos.likes_por_view
        + pesos.comentarios_por_view
        + pesos.sentimento
        + pesos.recencia
    )
    if peso_total <= 0:
        raise ValueError("Soma dos pesos do ranking deve ser > 0")

    pontuadas: list[LivePontuada] = []
    for sinal, vlog, ltx, ctx in zip(sinais_lista, views_log, likes_taxa, comm_taxa, strict=False):
        v_norm = normalizar_minmax(vlog, v_min, v_max)
        l_norm = normalizar_minmax(ltx, l_min, l_max)
        c_norm = normalizar_minmax(ctx, c_min, c_max)
        s_norm = max(0.0, min(1.0, sinal.sentimento_0a10 / 10.0))
        r_norm = calcular_recencia(sinal.data_publicacao, hoje)

        componentes_raw = {
            "views": pesos.views * v_norm,
            "likes_por_view": pesos.likes_por_view * l_norm,
            "comentarios_por_view": pesos.comentarios_por_view * c_norm,
            "sentimento": pesos.sentimento * s_norm,
            "recencia": pesos.recencia * r_norm,
        }
        escala = 100.0 / peso_total
        componentes = {k: round(v * escala, 2) for k, v in componentes_raw.items()}
        total = round(sum(componentes_raw.values()) * escala, 2)
        pontuadas.append(
            LivePontuada(
                video_id=sinal.video_id,
                pontuacao_total=total,
                componentes=componentes,
            )
        )
    return pontuadas
