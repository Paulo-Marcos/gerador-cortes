"""Quando cada item de um lote vai ao ar — a regra de espaçar, sem plataforma (D-908).

## Por que um lote não é "uma data só"

Porque cada Short passa por uma janela de teste com público pequeno, e dois
Shorts lançados no mesmo minuto disputam as MESMAS impressões: um come a
chance do outro. A pesquisa da D-903 convergiu num único conselho — espaçar e
preencher os dias — e o próprio YouTube cita "cadência que nenhum humano
sustentaria" como sinal de conteúdo inautêntico. Um lote de doze shorts às 14:05
é exatamente essa cadência.

## As três peças

  - a **referência do público**: para cada dia da semana, faixas de hora com
    intensidade (forte, médio, fraco). O operador a lê no relatório "Quando seus
    espectadores estão no YouTube" e digita na tela de Canais;
  - os **parâmetros do destino**: os blocos do dia (horas em que um grupo sai),
    quantos cabem por bloco e por dia, o intervalo mínimo entre itens e os dias
    ativos. "N shorts em X horas e depois passa para o dia seguinte" é um caso
    disto: um bloco só, N itens e intervalo X/N;
  - o **escalonamento**: percorre os dias a partir do ponto de partida, enche
    cada bloco até o teto e passa para o próximo bloco, depois para o próximo
    dia. O ponto de partida é o ÚLTIMO item já agendado naquele destino — um
    lote continua o anterior em vez de pisar nele — e nunca antes de agora mais a
    margem mínima.

Puro de propósito: sem banco, sem relógio, sem HTTP. Quem chama traz o "agora"
e o último agendado; daqui sai a lista de `Agendamento` por posição. É a RN-29.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum

from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.publicacao.agendamento import (
    MARGEM_MINIMA,
    PASSO_DO_MINUTO_TIKTOK,
    Agendamento,
)

DIAS_DA_SEMANA = ("segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo")
ULTIMO_DIA = len(DIAS_DA_SEMANA) - 1
TODOS_OS_DIAS: frozenset[int] = frozenset(range(len(DIAS_DA_SEMANA)))
# `weekday()` do sábado: a partir dele o público do canal chega mais cedo.
PRIMEIRO_DIA_DO_FIM_DE_SEMANA = 5
HORAS_DO_DIA = 24

# Os destinos que o escalonamento conhece, na ordem da tela. O Instagram fica de
# fora por MEDIÇÃO (12/09/2026 no desktop, 13/10/2026 emulando celular): o
# compositor do instagram.com não agenda, e no layout de celular nem vídeo
# aceita. Ele publica no ato, e a tela diz isso.
DESTINOS_ESCALONADOS = ("youtube", "youtube_shorts", "tiktok")

# Sem referência nenhuma, a janela "tarde/noite" da pesquisa (D-903).
JANELA_SEM_REFERENCIA = (16, 24)

# Dias que o escalonamento percorre antes de desistir: acima do horizonte mais
# longo (365 do YouTube) com folga. Sem este teto, dias ativos vazios ou um
# teto por dia pequeno demais poderiam rodar para sempre.
DIAS_A_PERCORRER = 400


class EscalonamentoInvalido(PedidoInvalido):
    """A referência ou os parâmetros não servem — e a mensagem diz o que corrigir."""


class Intensidade(StrEnum):
    FORTE = "forte"
    MEDIO = "medio"
    FRACO = "fraco"


@dataclass(frozen=True)
class FaixaDoPublico:
    """Uma faixa de horas de um dia da semana, com a força do público nela.

    `dia` segue `datetime.weekday()`: 0 é segunda, 6 é domingo. `fim` é
    exclusivo e vai até 24, para "das 15h às 23h" ser `(15, 23)` como se lê.
    """

    dia: int
    inicio: int
    fim: int
    intensidade: Intensidade


def _dia_util(dia: int) -> tuple[FaixaDoPublico, ...]:
    return (
        FaixaDoPublico(dia, 0, 9, Intensidade.FRACO),
        FaixaDoPublico(dia, 9, 15, Intensidade.MEDIO),
        FaixaDoPublico(dia, 15, 23, Intensidade.FORTE),
        FaixaDoPublico(dia, 23, 24, Intensidade.MEDIO),
    )


def _fim_de_semana(dia: int) -> tuple[FaixaDoPublico, ...]:
    return (
        FaixaDoPublico(dia, 0, 9, Intensidade.FRACO),
        FaixaDoPublico(dia, 9, 12, Intensidade.MEDIO),
        FaixaDoPublico(dia, 12, 23, Intensidade.FORTE),
        FaixaDoPublico(dia, 23, 24, Intensidade.MEDIO),
    )


# Lido do heatmap do canal do operador em 13/10/2026 (GMT-3, últimos 28 dias):
# forte das 15h às 23h todo dia, mais cedo (meio-dia) nos fins de semana, fraco
# de madrugada. É o ponto de partida de um canal novo, não uma verdade.
PADRAO_DO_PUBLICO: tuple[FaixaDoPublico, ...] = tuple(
    faixa
    for dia in sorted(TODOS_OS_DIAS)
    for faixa in (_fim_de_semana(dia) if dia >= PRIMEIRO_DIA_DO_FIM_DE_SEMANA else _dia_util(dia))
)


@dataclass(frozen=True)
class ParametrosDoDestino:
    """Como um destino distribui os itens ao longo do dia.

    `blocos` são horas `HH:MM` em ordem crescente; dentro de um bloco os itens
    saem de `intervalo_minimo_min` em `intervalo_minimo_min`. `teto_por_dia`
    vale sobre todos os blocos do dia.
    """

    blocos: tuple[str, ...]
    itens_por_bloco: int
    teto_por_dia: int
    intervalo_minimo_min: int
    dias_ativos: frozenset[int] = TODOS_OS_DIAS


PADRAO_POR_DESTINO: dict[str, ParametrosDoDestino] = {
    # O hábito do operador: dois blocos, quatro cortes em cada, de 15 em 15.
    "youtube": ParametrosDoDestino(("12:00", "18:00"), 4, 8, 15),
    # A pesquisa (D-903): tarde/noite, dois a três por dia, três horas entre eles.
    "youtube_shorts": ParametrosDoDestino(("16:00", "19:00", "22:00"), 1, 3, 180),
    # Mesmo desenho; constância é o que o TikTok premia.
    "tiktok": ParametrosDoDestino(("16:00", "19:00", "22:00"), 1, 3, 180),
}


def destino_de(plataforma: str) -> str | None:
    """O destino escalonado desta plataforma, ou `None` quando ela publica no ato.

    >>> destino_de("tiktok_horizontal")
    'tiktok'
    >>> destino_de("instagram_reels") is None
    True
    """
    if plataforma.startswith("tiktok"):
        return "tiktok"
    return plataforma if plataforma in DESTINOS_ESCALONADOS else None


# --------------------------------------------------------------------------- #
# Validação
# --------------------------------------------------------------------------- #


def validar_referencia(faixas: tuple[FaixaDoPublico, ...] | list[FaixaDoPublico]) -> None:
    """Faixas dentro do dia, sem se sobrepor no mesmo dia.

    >>> validar_referencia([FaixaDoPublico(0, 15, 23, Intensidade.FORTE)])
    >>> try:
    ...     validar_referencia([FaixaDoPublico(0, 15, 23, Intensidade.FORTE),
    ...                         FaixaDoPublico(0, 20, 24, Intensidade.FRACO)])
    ... except EscalonamentoInvalido as erro:
    ...     print(erro)
    na segunda, a faixa 20h-24h sobrepõe a faixa 15h-23h
    """
    por_dia: dict[int, list[FaixaDoPublico]] = {}
    for faixa in faixas:
        if not 0 <= faixa.dia <= ULTIMO_DIA:
            raise EscalonamentoInvalido(f"dia da semana fora de 0..{ULTIMO_DIA}: {faixa.dia}")
        if not (0 <= faixa.inicio < faixa.fim <= HORAS_DO_DIA):
            raise EscalonamentoInvalido(
                f"faixa {faixa.inicio}h-{faixa.fim}h inválida: o início vem antes do fim, "
                "entre 0 e 24"
            )
        for outra in por_dia.get(faixa.dia, []):
            if faixa.inicio < outra.fim and outra.inicio < faixa.fim:
                raise EscalonamentoInvalido(
                    f"na {DIAS_DA_SEMANA[faixa.dia]}, a faixa {faixa.inicio}h-{faixa.fim}h "
                    f"sobrepõe a faixa {outra.inicio}h-{outra.fim}h"
                )
        por_dia.setdefault(faixa.dia, []).append(faixa)


def _ler_hora(texto: str) -> time:
    try:
        horas, minutos = texto.strip().split(":")
        return time(int(horas), int(minutos))
    except (ValueError, AttributeError) as exc:
        raise EscalonamentoInvalido(
            f"não entendi a hora do bloco {texto!r}; esperava algo como 18:00"
        ) from exc


def _validar_blocos(blocos: tuple[str, ...]) -> list[time]:
    if not blocos:
        raise EscalonamentoInvalido("escolha ao menos um bloco (uma hora do dia)")
    horas = [_ler_hora(b) for b in blocos]
    for indice in range(1, len(horas)):
        if horas[indice] <= horas[indice - 1]:
            raise EscalonamentoInvalido(
                "os blocos precisam vir em ordem crescente, sem repetir: "
                f"{blocos[indice - 1]} depois de {blocos[indice]} não"
            )
    return horas


def _validar_quantidades(parametros: ParametrosDoDestino) -> None:
    if parametros.itens_por_bloco < 1:
        raise EscalonamentoInvalido("cada bloco precisa aceitar ao menos um item")
    if parametros.teto_por_dia < 1:
        raise EscalonamentoInvalido("o teto por dia precisa ser ao menos um item")
    if parametros.intervalo_minimo_min < 1:
        raise EscalonamentoInvalido("o intervalo mínimo precisa ser ao menos um minuto")
    if not parametros.dias_ativos:
        raise EscalonamentoInvalido("escolha ao menos um dia ativo")
    if any(not 0 <= d <= ULTIMO_DIA for d in parametros.dias_ativos):
        raise EscalonamentoInvalido(f"dia ativo fora de 0..{ULTIMO_DIA}")


def _validar_grade_do_tiktok(parametros: ParametrosDoDestino, horas: list[time]) -> None:
    passo = PASSO_DO_MINUTO_TIKTOK
    for hora, texto in zip(horas, parametros.blocos, strict=True):
        if hora.minute % passo:
            raise EscalonamentoInvalido(
                f"o TikTok só agenda de {passo} em {passo} minutos, e o bloco {texto} "
                "cai fora da grade"
            )
    if parametros.intervalo_minimo_min % passo:
        raise EscalonamentoInvalido(
            f"o TikTok só agenda de {passo} em {passo} minutos: o intervalo precisa ser "
            f"múltiplo de {passo}"
        )


def validar_parametros(parametros: ParametrosDoDestino, destino: str) -> None:
    """Recusa o que não dá para escalonar — ou que o destino não aceitaria.

    O caso que justifica o último ramo é o TikTok: o seletor dele só tem minutos
    de cinco em cinco, e um bloco às 18:03 nasceria fora da grade.

    >>> validar_parametros(PADRAO_POR_DESTINO["tiktok"], "tiktok")
    >>> def porque(p, destino="youtube_shorts"):
    ...     try:
    ...         validar_parametros(p, destino)
    ...     except EscalonamentoInvalido as erro:
    ...         print(erro)
    >>> porque(ParametrosDoDestino(("18:00", "12:00"), 1, 3, 60))
    os blocos precisam vir em ordem crescente, sem repetir: 18:00 depois de 12:00 não
    >>> porque(ParametrosDoDestino(("18:03",), 1, 3, 60), "tiktok")
    o TikTok só agenda de 5 em 5 minutos, e o bloco 18:03 cai fora da grade
    >>> porque(ParametrosDoDestino(("18:00",), 1, 3, 60, frozenset()))
    escolha ao menos um dia ativo
    """
    if destino not in DESTINOS_ESCALONADOS:
        raise EscalonamentoInvalido(f"destino desconhecido para escalonar: {destino!r}")
    horas = _validar_blocos(parametros.blocos)
    _validar_quantidades(parametros)
    if destino == "tiktok":
        _validar_grade_do_tiktok(parametros, horas)


# --------------------------------------------------------------------------- #
# Leitura da referência
# --------------------------------------------------------------------------- #


def intensidade_em(
    faixas: tuple[FaixaDoPublico, ...] | list[FaixaDoPublico], instante: datetime
) -> Intensidade:
    """A força do público naquele instante; `medio` quando a referência não diz.

    >>> intensidade_em(PADRAO_DO_PUBLICO, datetime(2030, 1, 7, 20, 0))  # segunda
    <Intensidade.FORTE: 'forte'>
    >>> intensidade_em(PADRAO_DO_PUBLICO, datetime(2030, 1, 7, 3, 0))
    <Intensidade.FRACO: 'fraco'>
    >>> intensidade_em([], datetime(2030, 1, 7, 3, 0))
    <Intensidade.MEDIO: 'medio'>
    """
    for faixa in faixas:
        if faixa.dia == instante.weekday() and faixa.inicio <= instante.hour < faixa.fim:
            return faixa.intensidade
    return Intensidade.MEDIO


def sugerir_blocos(
    faixas: tuple[FaixaDoPublico, ...] | list[FaixaDoPublico],
    quantidade: int,
    dias_ativos: frozenset[int] = TODOS_OS_DIAS,
) -> tuple[str, ...]:
    """Espalha `quantidade` blocos pela janela forte comum aos dias ativos.

    A janela é o trecho entre a primeira e a última hora que é FORTE em todos os
    dias ativos; sem hora forte em comum, o que for forte em algum deles. Os
    blocos ficam igualmente espaçados dentro dela, em minutos redondos de cinco,
    para servirem ao TikTok sem ajuste.

    >>> sugerir_blocos(PADRAO_DO_PUBLICO, 2)
    ('15:00', '19:00')
    >>> sugerir_blocos(PADRAO_DO_PUBLICO, 3, frozenset({5, 6}))
    ('12:00', '15:40', '19:20')
    >>> sugerir_blocos([], 2)
    ('16:00', '20:00')
    """
    quantidade = max(1, quantidade)
    dias = sorted(dias_ativos) or sorted(TODOS_OS_DIAS)
    fortes_por_dia = [
        frozenset(
            hora
            for faixa in faixas
            if faixa.dia == dia and faixa.intensidade is Intensidade.FORTE
            for hora in range(faixa.inicio, faixa.fim)
        )
        for dia in dias
    ]
    horas = frozenset.intersection(*fortes_por_dia) or frozenset.union(*fortes_por_dia)
    inicio, fim = (min(horas), max(horas) + 1) if horas else JANELA_SEM_REFERENCIA
    largura_min = (fim - inicio) * 60
    passo = largura_min / quantidade
    blocos = []
    for k in range(quantidade):
        minutos = inicio * 60 + int(k * passo)
        minutos -= minutos % PASSO_DO_MINUTO_TIKTOK
        blocos.append(f"{minutos // 60:02d}:{minutos % 60:02d}")
    return tuple(blocos)


# --------------------------------------------------------------------------- #
# O escalonamento
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Vaga:
    """Onde o item de uma posição do lote vai cair — ou por que ficou sem data."""

    posicao: int
    agendamento: Agendamento | None
    motivo: str = ""


def _candidatos_do_dia(dia: date, parametros: ParametrosDoDestino, fuso) -> list[datetime]:
    intervalo = timedelta(minutes=parametros.intervalo_minimo_min)
    return [
        datetime.combine(dia, _ler_hora(bloco), tzinfo=fuso) + k * intervalo
        for bloco in parametros.blocos
        for k in range(parametros.itens_por_bloco)
    ]


def escalonar(
    quantidade: int,
    parametros: ParametrosDoDestino,
    *,
    agora: datetime,
    ultimo: datetime | None = None,
    horizonte_dias: int | None = None,
) -> list[Vaga]:
    """Distribui `quantidade` itens pelos blocos, a partir do último já agendado.

    Cada candidato é bloco + k × intervalo; um candidato que ficou para trás
    (antes de agora mais a margem, ou perto demais do anterior) é PULADO, nunca
    empurrado — assim a grade continua sendo a grade, e um TikTok às 18:05 não
    vira 18:07 por causa de um item anterior.

    >>> from datetime import timezone
    >>> fuso = timezone(timedelta(hours=-3))
    >>> agora = datetime(2030, 1, 7, 10, 0, tzinfo=fuso)  # segunda, 10h
    >>> p = ParametrosDoDestino(("12:00", "18:00"), 2, 4, 15)
    >>> [v.agendamento.legivel() for v in escalonar(5, p, agora=agora)]
    ['07/01/2030 as 12:00', '07/01/2030 as 12:15', '07/01/2030 as 18:00', '07/01/2030 as 18:15', '08/01/2030 as 12:00']

    O último agendado puxa a partida, e o intervalo vale a partir dele:

    >>> ultimo = datetime(2030, 1, 7, 12, 10, tzinfo=fuso)
    >>> [v.agendamento.legivel() for v in escalonar(2, p, agora=agora, ultimo=ultimo)]
    ['07/01/2030 as 18:00', '07/01/2030 as 18:15']

    Fora do horizonte, o item fica sem data e diz por quê:

    >>> curto = ParametrosDoDestino(("12:00",), 1, 1, 15)
    >>> vagas = escalonar(3, curto, agora=agora, horizonte_dias=2)
    >>> [v.agendamento.legivel() if v.agendamento else v.motivo for v in vagas]
    ['07/01/2030 as 12:00', '08/01/2030 as 12:00', 'não cabe nos 2 dias que a plataforma deixa agendar']
    """
    if quantidade <= 0:
        return []
    fuso = agora.tzinfo
    limite_inferior = agora + MARGEM_MINIMA
    partida = max(limite_inferior, ultimo) if ultimo else limite_inferior
    fim_da_janela = agora + timedelta(days=horizonte_dias) if horizonte_dias else None
    intervalo = timedelta(minutes=parametros.intervalo_minimo_min)

    vagas: list[Vaga] = []
    anterior = ultimo
    dia = partida.astimezone(fuso).date()
    for _ in range(DIAS_A_PERCORRER):
        if len(vagas) >= quantidade:
            break
        if dia.weekday() in parametros.dias_ativos:
            no_dia = 0
            for instante in _candidatos_do_dia(dia, parametros, fuso):
                if len(vagas) >= quantidade or no_dia >= parametros.teto_por_dia:
                    break
                if instante <= limite_inferior:
                    continue
                if anterior is not None and instante < anterior + intervalo:
                    continue
                if fim_da_janela is not None and instante > fim_da_janela:
                    return _completar_sem_data(vagas, quantidade, horizonte_dias)
                vagas.append(Vaga(len(vagas), Agendamento(instante)))
                anterior = instante
                no_dia += 1
        dia += timedelta(days=1)
    return _completar_sem_data(vagas, quantidade, horizonte_dias)


def _completar_sem_data(
    vagas: list[Vaga], quantidade: int, horizonte_dias: int | None
) -> list[Vaga]:
    motivo = (
        f"não cabe nos {horizonte_dias} dias que a plataforma deixa agendar"
        if horizonte_dias
        else f"não coube em {DIAS_A_PERCORRER} dias; aumente o teto por dia"
    )
    while len(vagas) < quantidade:
        vagas.append(Vaga(len(vagas), None, motivo))
    return vagas
