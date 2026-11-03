"""O que o corte faz com os riscados ao gerar, dividir e juntar (RN-35, RN-36, D-1017).

Separado de `services/riscados.py` porque `services/corte.py` usa isto, e as ações do
operador usam `CorteService`: juntos, os dois módulos fechariam um ciclo de import.
"""

from __future__ import annotations

import json
from datetime import datetime

from app.domain.corte import riscados as dominio
from app.domain.corte.segment_calculator import (
    dividir_desvios_no_ponto,
    normalizar_desvio,
    somar_aos_desvios_gravados,
    somar_desvios_novos,
)
from app.domain.corte.snap_desvios import palavras_do_corte
from app.models import Corte


def registrar_rodada(
    corte: Corte, aceitas: list[dict], recusadas: list[dict]
) -> tuple[int, int, int]:
    """Grava uma rodada da `trechos-expert` no corte: (total no corte, novos, recusados).

    Soma ao que está gravado AGORA (D-976), sem tocar no que o operador marcou
    (D-332), e deixa de fora o que ele já riscou. D-334: conta a invocação, tanto
    do botão por corte quanto do lote.
    """
    riscados = dominio.riscados_gravados(corte.desvios_riscados)
    gravados = json.loads(corte.desvios or "[]")
    rodada = dominio.proxima_rodada(corte.trechos_geracoes, [*gravados, *riscados])
    novas = dominio.novos_sem_os_riscados(aceitas, riscados)
    mesclados, adicionados = somar_aos_desvios_gravados(
        corte.desvios, [dominio.carimbar_rodada(d, rodada) for d in novas]
    )
    riscados, recusados = somar_desvios_novos(
        riscados,
        [
            dominio.carimbar_rodada(d, rodada)
            for d in dominio.sem_as_que_cobrem(recusadas, gravados)
        ],
    )
    corte.desvios = json.dumps(mesclados, ensure_ascii=False)
    corte.desvios_riscados = json.dumps(riscados, ensure_ascii=False)
    corte.trechos_geracoes = (corte.trechos_geracoes or 0) + 1
    log = json.loads(corte.trechos_geracoes_log or "[]")
    log.append(
        {
            "em": datetime.utcnow().isoformat(),
            "rodada": rodada,
            "adicionados": adicionados,
            "recusados": recusados,
            "total_apos": len(mesclados),
        }
    )
    corte.trechos_geracoes_log = json.dumps(log, ensure_ascii=False)
    return len(mesclados), adicionados, recusados


def marcas_que_a_ia_nao_repete(corte: Corte) -> list[dict]:
    """O que vai no prompt como já decidido: o que está marcado e o que o operador riscou.

    A fala do riscado FICA no corte, e o motivo diz isso: sem o aviso, a IA julgaria uma
    repetição como se aquela fala já tivesse saído.
    """
    riscados = dominio.riscados_pelo_operador(dominio.riscados_gravados(corte.desvios_riscados))
    return [
        *(normalizar_desvio(d) for d in json.loads(corte.desvios or "[]")),
        *(
            {
                **normalizar_desvio(d),
                "motivo": f"o operador manteve no corte: {d.get('motivo', '')}",
            }
            for d in riscados
        ),
    ]


def dividir_riscados(corte: Corte, ponto_seg: float) -> str:
    """O corte fica com os riscados da esquerda; devolve os da direita, para o corte novo."""
    esquerda, direita = dividir_desvios_no_ponto(
        dominio.riscados_gravados(corte.desvios_riscados), ponto_seg
    )
    corte.desvios_riscados = json.dumps(esquerda, ensure_ascii=False)
    return json.dumps(direita, ensure_ascii=False)


def juntar_riscados(primeiro: Corte, segundo: Corte) -> None:
    """O corte que sobrevive à junção leva os riscados do que é apagado."""
    primeiro.desvios_riscados = json.dumps(
        [
            *dominio.riscados_gravados(primeiro.desvios_riscados),
            *dominio.riscados_gravados(segundo.desvios_riscados),
        ],
        ensure_ascii=False,
    )


def palavras_para_conferir(transcricao_raw: object) -> list[dict]:
    """A fala inteira: a IA lê até 60 s além do corte, e conferir só dentro dele recusaria
    citação certa (RN-35)."""
    return palavras_do_corte(transcricao_raw, 0, 0) if isinstance(transcricao_raw, list) else []
