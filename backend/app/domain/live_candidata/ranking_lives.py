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
    """Soma livre — não precisa fechar em 1.0; o resultado normaliza para 0-100.

    Os defaults refletem a filosofia do dono (D-356): o público que genuinamente
    curtiu vale mais que audiência bruta — positividade + volume de comentários >
    likes (%views) > recência > VPH > views. O serviço injeta os valores do canal
    (via `ranking_settings`); estes só valem quando ninguém passa pesos.
    """

    views: float = 0.08
    likes_por_view: float = 0.15
    comentarios_por_view: float = 0.25
    sentimento: float = 0.30
    recencia: float = 0.12
    # VPH (views por hora): "momento" da live, normalizado por lote como views (D-356).
    vph: float = 0.10
    # Meia-vida do decay de recência (dias). Fica junto dos pesos para o serviço
    # injetar o valor de settings; o domínio segue puro (não lê config).
    meia_vida_dias: float = 90.0


# As chaves que são PESOS (entram no reescalonamento 0-100). `meia_vida_dias` é um
# PARÂMETRO do decay de recência, não um peso — validado à parte (deve ser > 0).
CHAVES_PESO: tuple[str, ...] = (
    "views",
    "likes_por_view",
    "comentarios_por_view",
    "sentimento",
    "recencia",
    "vph",
)
CHAVE_MEIA_VIDA = "meia_vida_dias"
CHAVES_CRITERIO: tuple[str, ...] = (*CHAVES_PESO, CHAVE_MEIA_VIDA)


def validar_pesos(valores: dict) -> None:
    """Valida os pesos de um canal antes de gravar; levanta `ValueError` se inválidos.

    Regras (D-351, trazidas para o domínio na D-762):
      - todas as chaves presentes;
      - todos os valores >= 0 (peso negativo não faz sentido);
      - ao menos UM peso > 0 (senão o reescalonamento 0-100 zeraria — divisão por 0);
      - `meia_vida_dias` > 0 (o decay exponencial exige meia-vida positiva).
    """
    faltando = [k for k in CHAVES_CRITERIO if k not in valores]
    if faltando:
        raise ValueError("Faltam critérios: " + ", ".join(sorted(faltando)) + ".")

    for chave in CHAVES_CRITERIO:
        try:
            valor = float(valores[chave])
        except (TypeError, ValueError) as e:
            raise ValueError(f"O valor de '{chave}' deve ser numérico.") from e
        if valor < 0:
            raise ValueError(f"O valor de '{chave}' não pode ser negativo.")

    if all(float(valores[chave]) == 0 for chave in CHAVES_PESO):
        raise ValueError("Ao menos um peso deve ser maior que 0 (senão o ranking zera).")

    if float(valores[CHAVE_MEIA_VIDA]) <= 0:
        raise ValueError("A meia-vida da recência (dias) deve ser maior que 0.")


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
class ComponenteDetalhado:
    """Embasamento de UM critério numa live (D-356): por que ele deu esta nota.

    - `valor_bruto`: o número cru do critério (views, taxa de likes, sentimento 0-10,
      idade em dias, VPH…) — o que o dono reconhece.
    - `valor_normalizado`: 0-1 dentro do lote (o quão bem essa live se saiu FRENTE às
      outras candidatas neste critério).
    - `peso`: quanto o critério pesa (o peso do canal, injetado).
    - `contribuicao`: quantos pontos (na escala 0-100) o critério somou à nota final.
      A soma das `contribuicao` de todos os critérios é a `pontuacao_total`.
    """

    criterio: str
    valor_bruto: float
    valor_normalizado: float
    peso: float
    contribuicao: float


@dataclass(frozen=True)
class LivePontuada:
    video_id: str
    pontuacao_total: float
    componentes: dict[str, float]
    detalhes: list[ComponenteDetalhado]


# Piso da idade (horas) no cálculo do VPH: uma live com 10 min de vida e 6k views
# daria um VPH absurdo (36k/h) e dominaria o lote. O piso trata tudo abaixo de
# `PISO_IDADE_HORAS_VPH` como se tivesse essa idade — o "momento" só é comparável
# depois que a live teve algumas horas para acumular audiência. 6h é o horizonte a
# partir do qual a taxa por hora fica representativa (D-356).
PISO_IDADE_HORAS_VPH = 6.0


def calcular_vph(
    views: int,
    data_publicacao: datetime,
    hoje: datetime,
    piso_horas: float = PISO_IDADE_HORAS_VPH,
) -> float:
    """Views por hora, com piso de idade para não inflar lives recém-publicadas.

    VPH = views / max(idade_horas, piso). Datas no futuro (input inconsistente)
    caem no piso, nunca produzindo divisão por número negativo/zero.
    """
    idade_horas = (hoje - data_publicacao).total_seconds() / 3600.0
    idade_horas = max(idade_horas, piso_horas)
    return max(0, views) / idade_horas


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
    - VPH (views por hora, com piso de idade) em escala log, normalizado por lote
      como as views — capta o "momento" da live sem premiar a recém-publicada.

    Cada `LivePontuada` traz também `detalhes`: o embasamento por critério
    (bruto → normalizado → peso → contribuição), cuja soma reconstitui a nota.

    Retorna na mesma ordem de entrada, com `pontuacao_total` em 0-100.
    """
    sinais_lista = list(sinais)
    if not sinais_lista:
        return []
    hoje = hoje or datetime.now(UTC)

    views_log = [math.log1p(max(0, s.views)) for s in sinais_lista]
    likes_taxa = [(s.likes / s.views) if s.views > 0 else 0.0 for s in sinais_lista]
    comm_taxa = [(s.comentarios / s.views) if s.views > 0 else 0.0 for s in sinais_lista]
    vph_valores = [calcular_vph(s.views, s.data_publicacao, hoje) for s in sinais_lista]
    vph_log = [math.log1p(v) for v in vph_valores]

    v_min, v_max = min(views_log), max(views_log)
    l_min, l_max = min(likes_taxa), max(likes_taxa)
    c_min, c_max = min(comm_taxa), max(comm_taxa)
    vph_min, vph_max = min(vph_log), max(vph_log)

    peso_total = (
        pesos.views
        + pesos.likes_por_view
        + pesos.comentarios_por_view
        + pesos.sentimento
        + pesos.recencia
        + pesos.vph
    )
    if peso_total <= 0:
        raise ValueError("Soma dos pesos do ranking deve ser > 0")
    escala = 100.0 / peso_total

    pontuadas: list[LivePontuada] = []
    for i, sinal in enumerate(sinais_lista):
        v_norm = normalizar_minmax(views_log[i], v_min, v_max)
        l_norm = normalizar_minmax(likes_taxa[i], l_min, l_max)
        c_norm = normalizar_minmax(comm_taxa[i], c_min, c_max)
        s_norm = max(0.0, min(1.0, sinal.sentimento_0a10 / 10.0))
        r_norm = calcular_recencia(sinal.data_publicacao, hoje, pesos.meia_vida_dias)
        vph_norm = normalizar_minmax(vph_log[i], vph_min, vph_max)
        idade_dias = max(0.0, (hoje - sinal.data_publicacao).total_seconds() / 86_400.0)

        # (criterio, valor_bruto, valor_normalizado, peso) — o bruto é o número que o
        # dono reconhece; recência mostra a idade em dias (o decay é o normalizado).
        criterios = (
            ("views", float(sinal.views), v_norm, pesos.views),
            ("likes_por_view", likes_taxa[i], l_norm, pesos.likes_por_view),
            ("comentarios_por_view", comm_taxa[i], c_norm, pesos.comentarios_por_view),
            ("sentimento", sinal.sentimento_0a10, s_norm, pesos.sentimento),
            ("recencia", idade_dias, r_norm, pesos.recencia),
            ("vph", vph_valores[i], vph_norm, pesos.vph),
        )

        detalhes: list[ComponenteDetalhado] = []
        soma_raw = 0.0
        for criterio, bruto, norm, peso in criterios:
            contrib_raw = peso * norm
            soma_raw += contrib_raw
            detalhes.append(
                ComponenteDetalhado(
                    criterio=criterio,
                    valor_bruto=round(bruto, 4),
                    valor_normalizado=round(norm, 4),
                    peso=round(peso, 4),
                    contribuicao=round(contrib_raw * escala, 2),
                )
            )

        componentes = {d.criterio: d.contribuicao for d in detalhes}
        total = round(soma_raw * escala, 2)
        pontuadas.append(
            LivePontuada(
                video_id=sinal.video_id,
                pontuacao_total=total,
                componentes=componentes,
                detalhes=detalhes,
            )
        )
    return pontuadas
