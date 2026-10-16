"""O palco escolhido para um projeto ou um corte, por tipo de vídeo (D-923).

O palco GLOBAL é o do canal (tela de Canais). No modal de posição do pós (o
horizontal) e no do short, o operador ajusta o palco só daquele corte ou
daquele projeto — estilo, fundo, cabeçalho, placa, cards, janelas do short —
sem mexer no canal. Cada tipo tem a sua escolha: o que se ajusta no modal do
horizontal não vaza para o short, e vice-versa.

Cascata: o corte vence o projeto, que vence o canal. Parcial (RN-10): o escopo
guarda só o que difere do nível de cima; a chave ausente é a herança.

Sem I/O.
"""

from __future__ import annotations

import logging
from typing import Any

from app.domain.canal.palco_componentes import PalcoComponentes, mesclar
from app.domain.compartilhado.erros import PedidoInvalido

logger = logging.getLogger(__name__)

TIPOS = ("horizontal", "short")


def normalizar(dados: Any) -> dict[str, dict[str, Any]]:
    """O que um escopo escolheu, por tipo (o resto é herança).

    Exemplos:
        >>> normalizar({"horizontal": {"estilo": "limpo"}, "short": {}, "outro": {"x": 1}})
        {'horizontal': {'estilo': 'limpo'}}
        >>> normalizar(None)
        {}
    """
    if not isinstance(dados, dict):
        return {}
    return {
        tipo: dados[tipo] for tipo in TIPOS if isinstance(dados.get(tipo), dict) and dados[tipo]
    }


def aplicar(componentes: PalcoComponentes, *parciais: dict[str, Any]) -> PalcoComponentes:
    """Os componentes com as escolhas dos escopos por cima, na ordem dada.

    Uma escolha gravada que deixou de valer (um estilo que sumiu) é ignorada:
    um registro antigo não pode derrubar um render.

    Exemplos:
        >>> from app.domain.canal.palco_componentes import PADRAO
        >>> aplicar(PADRAO, {"estilo": "limpo"}, {"fundo": "linho"}).fundo
        'linho'
        >>> aplicar(PADRAO, {"estilo": "limpo"}, {"estilo": "atual"}).estilo
        'atual'
        >>> aplicar(PADRAO, {"estilo": "neon"}).estilo
        'atual'
    """
    for parcial in parciais:
        try:
            componentes = mesclar(componentes, parcial)
        except PedidoInvalido:
            logger.warning("[Palco] escolha de escopo invalida ignorada: %s", parcial)
    return componentes


# Dicionários que valem inteiros: uma posição ou a caixa do card (D-941) pela
# metade não significam nada, então a diferença os grava completos.
_VALORES_INTEIROS = ("posicao", "posicao_short", "zona_no_cheio")


def diferenca(base: dict[str, Any], novo: dict[str, Any]) -> dict[str, Any]:
    """Só o que `novo` muda em relação a `base` (é o que o escopo grava).

    Exemplos:
        >>> diferenca({"estilo": "atual", "placa": {"ativo": True, "escala": 1.0}},
        ...           {"estilo": "atual", "placa": {"ativo": False, "escala": 1.0}})
        {'placa': {'ativo': False}}
        >>> diferenca({"fundo": "linho"}, {"fundo": "linho"})
        {}
    """
    saida: dict[str, Any] = {}
    for chave, valor in novo.items():
        anterior = base.get(chave)
        if (
            isinstance(valor, dict)
            and isinstance(anterior, dict)
            and chave not in _VALORES_INTEIROS
        ):
            interna = diferenca(anterior, valor)
            if interna:
                saida[chave] = interna
        elif valor != anterior:
            saida[chave] = valor
    return saida


def origem(do_projeto: dict[str, Any], do_corte: dict[str, Any]) -> str:
    """De onde vem o palco que vale: do corte, do projeto ou do canal.

    Exemplos:
        >>> origem({}, {"estilo": "limpo"})
        'corte'
        >>> origem({"placa": {"ativo": False}}, {})
        'projeto'
        >>> origem({}, {})
        'canal'
    """
    if do_corte:
        return "corte"
    if do_projeto:
        return "projeto"
    return "canal"
