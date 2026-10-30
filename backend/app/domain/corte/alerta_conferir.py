"""Alerta "conferir" do corte (D-998): um trecho que FICA e pede checagem de fato.

O desvio decide o que sai do corte; o alerta só aponta uma afirmação que a IA
achou duvidosa (número, data, autoria). Quando a dúvida virava desvio
(`imprecisao`), o trecho saía e o operador desfez 77% deles: tirar a frase
tirava conteúdo (D-989). Por isso o alerta mora em coluna própria e nada que
calcula o corte (segmentos, líquido, transcrição final, render) o lê.

O editor dispensa o alerta marcando-o como conferido. O conferido continua
gravado: assim uma nova geração de trechos não o propõe de novo.
"""

import json

from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.desvio_categoria import IMPRECISAO, normalizar_categoria
from app.domain.corte.segment_calculator import (
    dividir_desvios_no_ponto,
    normalizar_desvio,
    somar_desvios_novos,
)


def alertas_gravados(coluna: object) -> list:
    """Os alertas como estão na coluna; [] quando ela não tem texto (linha antiga, NULL)."""
    return json.loads(coluna) if isinstance(coluna, str) and coluna else []


def alerta_de_trecho(trecho: dict, origem: str) -> dict | None:
    """Alerta a partir do trecho devolvido pela IA; `None` sem bordas válidas.

    O `id` sai das bordas: a soma descarta alerta com as mesmas bordas, então
    ele é único no corte sem depender de gerador aleatório.
    """
    bordas = normalizar_desvio(trecho)
    inicio, fim = bordas.get("inicio_seg"), bordas.get("fim_seg")
    if inicio is None or fim is None or fim <= inicio:
        return None
    return {
        "id": f"{round(inicio * 1000)}-{round(fim * 1000)}",
        "inicio_hms": bordas["inicio_hms"],
        "fim_hms": bordas["fim_hms"],
        "inicio_seg": inicio,
        "fim_seg": fim,
        "motivo": str(trecho.get("motivo") or "").strip(),
        "origem": origem,
        "conferido": False,
    }


def separar_imprecisoes(desvios: list) -> tuple[list, list]:
    """Divide os desvios propostos pela IA em (os que saem, os que viram alerta).

    Skill anterior à v8 ainda propõe `imprecisao` como desvio: aqui ela deixa
    de remover o trecho e vira alerta. Só passa por aqui a resposta da IA; o
    desvio que o editor marcou na mão nunca é reclassificado.
    """
    saem: list = []
    conferir: list = []
    for desvio in desvios:
        categoria = normalizar_categoria(
            desvio.get("categoria") or desvio.get("tipo"), str(desvio.get("motivo") or "")
        )
        (conferir if categoria == IMPRECISAO else saem).append(desvio)
    return saem, conferir


def alertas_da_resposta(resposta: dict, origem: str) -> tuple[list, list]:
    """(desvios que saem, alertas) da resposta da trechos-expert.

    Os alertas vêm da chave `conferir` e das imprecisões propostas como desvio.
    """
    saem, imprecisoes = separar_imprecisoes(resposta.get("desvios") or [])
    brutos = list(resposta.get("conferir") or []) + imprecisoes
    alertas = [alerta for alerta in (alerta_de_trecho(t, origem) for t in brutos) if alerta]
    return saem, alertas


def somar_alertas(gravados: list, novos: list) -> tuple[list, int]:
    """Acrescenta os alertas novos sem tocar nos gravados — conferidos inclusive.

    Mesma regra cumulativa dos desvios (D-332): alerta com as bordas de um já
    gravado é pulado. Devolve (lista ordenada, quantos entraram).
    """
    somados, adicionados = somar_desvios_novos(gravados, novos)
    somados.sort(key=lambda alerta: alerta.get("inicio_seg", 0))
    return somados, adicionados


def dividir_alertas_no_ponto(alertas: list, ponto_seg: float) -> tuple[list, list]:
    """(alertas da metade esquerda, da direita) ao dividir o corte no ponto.

    Mesma regra dos desvios: o alerta que cruza o ponto vai para as duas
    metades, cada uma com a sua parte — a afirmação continua a conferir dos dois
    lados.
    """
    return dividir_desvios_no_ponto(alertas, ponto_seg)


def juntar_alertas(do_primeiro: list, do_segundo: list) -> list:
    """Os alertas do corte que sobrevive à junção: os dois lados, sem duplicar."""
    return somar_alertas(do_primeiro, do_segundo)[0]


def marcar_conferido(alertas: list, alerta_id: str) -> list:
    """Devolve os alertas com `alerta_id` conferido; os outros ficam como estão."""
    if not any(alerta.get("id") == alerta_id for alerta in alertas):
        raise NaoEncontrado("Alerta não encontrado neste corte.")
    return [
        {**alerta, "conferido": True} if alerta.get("id") == alerta_id else alerta
        for alerta in alertas
    ]
