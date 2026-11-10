"""O silêncio do app, decidido de uma vez (P9, D-1093, RN-36).

O silêncio é a pausa que o FFmpeg acha no áudio do corte (`origem: tecnico`). A
pergunta 1 da aba Decisões responde por todos: tirar todos ou manter todos. A
exceção se risca como qualquer trecho, e o riscado vale: nem a salvaguarda do
bruto, que procura os silêncios de novo a cada geração, nem o botão Silêncios
recolocam o que você riscou. Os dois seguem gravando todos os outros.

Puro: sem banco e sem I/O.
"""

from __future__ import annotations

from app.domain.corte.segment_calculator import normalizar_desvio

# Dois desvios que começam a menos disso um do outro são o mesmo desvio.
DISTANCIA_DE_DUPLICATA_SEG = 0.5


def e_silencio_do_app(marca: dict) -> bool:
    return marca.get("origem") == "tecnico"


def _inicio(marca: dict) -> float:
    return float(marca.get("inicio_seg") or 0.0)


def _por_tempo(marcas: list[dict]) -> list[dict]:
    return sorted(marcas, key=_inicio)


def _perto_de_alguma(marca: dict, outras: list[dict]) -> bool:
    return any(abs(_inicio(o) - _inicio(marca)) < DISTANCIA_DE_DUPLICATA_SEG for o in outras)


def silencios_a_gravar(
    novos: list[dict], existentes: list[dict], riscados: list[dict]
) -> list[dict]:
    """Os silêncios detectados que entram no corte, na ordem em que chegaram.

    Fica de fora o que começa perto de uma marca que já está no corte (ou de outro
    silêncio desta mesma leva) e o que começa perto de um silêncio que você riscou.
    """
    silencios_riscados = [r for r in riscados if e_silencio_do_app(r)]
    entram: list[dict] = []
    for novo in novos:
        if _perto_de_alguma(novo, [*existentes, *entram]):
            continue
        if _perto_de_alguma(novo, silencios_riscados):
            continue
        entram.append(novo)
    return entram


def manter_silencios(desvios: list[dict], riscados: list[dict]) -> tuple[list[dict], list[dict]]:
    """Manter todos: todo silêncio do app sai do corte e vai para os riscados."""
    silencios = [normalizar_desvio(d) for d in desvios if e_silencio_do_app(d)]
    restantes = [d for d in desvios if not e_silencio_do_app(d)]
    return restantes, _por_tempo([*riscados, *silencios])


def tirar_silencios(desvios: list[dict], riscados: list[dict]) -> tuple[list[dict], list[dict]]:
    """Tirar todos: todo silêncio riscado volta ao corte.

    O que já tem uma marca no mesmo ponto não entra duas vezes: só deixa os riscados.
    """
    voltam = [r for r in riscados if e_silencio_do_app(r)]
    ficam_riscados = [r for r in riscados if not e_silencio_do_app(r)]
    entram = silencios_a_gravar(voltam, desvios, [])
    return _por_tempo([*desvios, *entram]), ficam_riscados
