"""O trecho que o operador marca na mão, a caminho da lista de desvios do corte."""

from app.domain.compartilhado.time_convert import to_seg
from app.domain.corte.segment_calculator import normalizar_desvio


def _ler_intervalo(desvio: dict) -> tuple[float, float]:
    normalizado = normalizar_desvio(desvio)
    return normalizado["inicio_seg"], normalizado["fim_seg"]


def incluir_desvio(desvios: list[dict], inicio_hms: str, fim_hms: str, motivo: str) -> list[dict]:
    """A lista com o trecho novo, em ordem de início.

    D-1040: o mesmo intervalo não entra duas vezes. Repetir é o que o operador faz
    quando não viu a resposta do primeiro pedido, e cortar duas vezes o mesmo pedaço
    só sujaria a lista. A marca que já existe fica como está, com o motivo dela.
    """
    novo = {
        "inicio_hms": inicio_hms,
        "fim_hms": fim_hms,
        "inicio_seg": to_seg(inicio_hms),
        "fim_seg": to_seg(fim_hms),
        "motivo": motivo or "Desvio manual",
        "origem": "manual",
    }
    if _ler_intervalo(novo) in map(_ler_intervalo, desvios):
        return desvios
    return sorted([*desvios, novo], key=lambda d: d.get("inicio_seg", 0))
