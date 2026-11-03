"""O que sai fica visível e volta: os trechos riscados e a rodada da IA (RN-36, D-1017).

Uma marca riscada muda de lista: sai de `desvios` e vai para `desvios_riscados`.
Por isso quem calcula o líquido, a transcrição e o render continua lendo só
`desvios`, sem precisar saber que o riscado existe.

Rodada é uma geração da `trechos-expert`. A marca nasce carimbada com o número
dela e com as bordas que recebeu; se as bordas mudaram, foi o operador quem
ajustou, e desfazer a rodada não a leva.

Puro: sem banco e sem I/O.
"""

from __future__ import annotations

import json

from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.corte.ancora_match import recusa_da_citacao
from app.domain.corte.segment_calculator import normalizar_desvio

# Tolerância para comparar a borda atual com a do carimbo: o HMS guarda milissegundos.
_TOLERANCIA_BORDA_SEG = 0.002
_SOBREPOSICAO_DA_MESMA_FALA = 0.5


def riscados_gravados(texto: str | None) -> list[dict]:
    """Os riscados como estão gravados; JSON ruim ou fora do formato vira lista vazia."""
    try:
        lista = json.loads(texto or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return [item for item in lista if isinstance(item, dict)] if isinstance(lista, list) else []


def _por_tempo(marcas: list[dict]) -> list[dict]:
    return sorted(marcas, key=lambda m: float(m.get("inicio_seg") or 0.0))


def riscar(desvios: list[dict], riscados: list[dict], indice: int) -> tuple[list[dict], list[dict]]:
    """Muda o desvio `indice` para os riscados. Quem chama já validou o índice."""
    restantes = [d for i, d in enumerate(desvios) if i != indice]
    return restantes, _por_tempo([*riscados, normalizar_desvio(desvios[indice])])


def restaurar(
    desvios: list[dict], riscados: list[dict], indice: int
) -> tuple[list[dict], list[dict]]:
    """Devolve o riscado `indice` ao corte. Restaurar é a decisão do operador: a recusa
    deixa de valer, e a marca sai da rodada, para desfazer não a levar de novo."""
    if not 0 <= indice < len(riscados):
        raise PedidoInvalido("Este trecho riscado não existe mais. Atualize a tela.")
    volta = {
        chave: valor
        for chave, valor in riscados[indice].items()
        if chave not in ("recusa", "rodada", "borda_da_rodada")
    }
    restantes = [r for i, r in enumerate(riscados) if i != indice]
    return _por_tempo([*desvios, volta]), restantes


def carimbar_rodada(desvio: dict, rodada: int) -> dict:
    """Carimba a marca com a rodada e as bordas finais, depois da âncora e do snap."""
    marca = normalizar_desvio(desvio)
    return {**marca, "rodada": rodada, "borda_da_rodada": [marca["inicio_seg"], marca["fim_seg"]]}


def proxima_rodada(geracoes: int | None, marcas: list[dict]) -> int:
    """O número da próxima rodada. O contador sozinho não basta: o corte novo de uma
    divisão nasce zerado e herda marcas de rodadas altas, e a nova seria tida por antiga."""
    return max([geracoes or 0, *(m.get("rodada") or 0 for m in marcas)]) + 1


def _intacta(desvio: dict) -> bool:
    """A marca segue com as bordas que a rodada deu? Ajustada à mão, deixa de ser da IA."""
    borda = desvio.get("borda_da_rodada")
    if desvio.get("rodada") is None or not borda:
        return False
    marca = normalizar_desvio(desvio)
    return (
        abs(marca["inicio_seg"] - borda[0]) <= _TOLERANCIA_BORDA_SEG
        and abs(marca["fim_seg"] - borda[1]) <= _TOLERANCIA_BORDA_SEG
    )


def _ultima_rodada(desvios: list[dict]) -> int | None:
    return max((d["rodada"] for d in desvios if _intacta(d)), default=None)


def trechos_da_ultima_rodada(desvios: list[dict]) -> int:
    """Quantos trechos saem ao desfazer agora. Zero: a tela nem oferece a ação."""
    rodada = _ultima_rodada(desvios)
    return sum(1 for d in desvios if _intacta(d) and d["rodada"] == rodada) if rodada else 0


def desfazer_rodada(
    desvios: list[dict], riscados: list[dict]
) -> tuple[list[dict], list[dict], int]:
    """Risca a última rodada inteira e devolve (desvios, riscados, número da rodada).

    Só leva o que continua como a IA deixou: marca feita ou ajustada à mão fica.
    """
    rodada = _ultima_rodada(desvios)
    if rodada is None:
        raise PedidoInvalido("Não há rodada da IA para desfazer neste corte.")
    sai = [d for d in desvios if _intacta(d) and d["rodada"] == rodada]
    fica = [d for d in desvios if not (_intacta(d) and d["rodada"] == rodada)]
    return fica, _por_tempo([*riscados, *sai]), rodada


def separar_por_citacao(desvios: list[dict], palavras: list[dict]) -> tuple[list[dict], list[dict]]:
    """(aceitas, recusadas): RN-35 aplicada a uma rodada. A recusada leva o motivo.

    Marca sem as duas bordas não é marca (`desvio_de_trecho` faz o mesmo): cai aqui,
    para não derrubar a rodada inteira depois de minutos de IA.
    """
    aceitas: list[dict] = []
    recusadas: list[dict] = []
    for desvio in desvios:
        if desvio.get("inicio_seg") is None or desvio.get("fim_seg") is None:
            continue
        recusa = recusa_da_citacao(desvio, palavras)
        if recusa:
            recusadas.append({**desvio, "recusa": recusa})
        else:
            aceitas.append(desvio)
    return aceitas, recusadas


def riscados_pelo_operador(riscados: list[dict]) -> list[dict]:
    """Os que o operador tirou. O que o app recusou fica de fora: pode voltar corrigido."""
    return [r for r in riscados if not r.get("recusa")]


def _cobre(marca: dict, outra: dict) -> bool:
    """As duas tratam da mesma fala? Mais da metade da menor cai dentro da outra."""
    a, b = normalizar_desvio(marca), normalizar_desvio(outra)
    comum = min(a["fim_seg"], b["fim_seg"]) - max(a["inicio_seg"], b["inicio_seg"])
    menor = min(a["fim_seg"] - a["inicio_seg"], b["fim_seg"] - b["inicio_seg"])
    return menor > 0 and comum / menor > _SOBREPOSICAO_DA_MESMA_FALA


def sem_as_que_cobrem(novas: list[dict], marcas: list[dict]) -> list[dict]:
    """Tira de `novas` o que já está em `marcas`, mesmo com bordas um pouco diferentes."""
    return [n for n in novas if not any(_cobre(n, m) for m in marcas)]


def novos_sem_os_riscados(novos: list[dict], riscados: list[dict]) -> list[dict]:
    """Tira de `novos` o que o operador já riscou: decidido uma vez, não volta sozinho."""
    return sem_as_que_cobrem(novos, riscados_pelo_operador(riscados))
