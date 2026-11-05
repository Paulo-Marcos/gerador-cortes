"""O bruto ainda reflete os trechos do corte? (D-1044)

O bruto sai dos desvios e do arranjo daquele instante, e o render parte dele. Riscar
um trecho depois disso muda o líquido na tela e não muda o vídeo, sem nada avisar.
Aqui se compara o que foi cortado (`trechos_do_bruto`, D-1027) com o que sairia hoje.
Só avisa: quem decide regerar é o operador.
"""

from __future__ import annotations

from pathlib import Path

from app.domain.corte.segment_calculator import mesclar_desvios_sobrepostos
from app.infrastructure import trechos_do_bruto
from app.models import Corte, Projeto
from app.services.export import (
    _desvios_do_corte,
    _intervalo_dentro_do_video,
    _segmentos_do_bruto,
)

# O registro guarda 3 casas; acima disto é mudança de verdade, não arredondamento.
_FOLGA_SEG = 0.01


def bruto_ficou_para_tras(corte: Corte, projeto: Projeto, bruto: Path) -> bool:
    """`True` quando o corte de hoje cortaria outros trechos que os do bruto no disco.

    Bruto sem registro (de antes da D-1027, ou ilegível) não dá alarme: sem saber o
    que foi cortado, avisar seria chute. O mesmo vale para o desvio ilegível: o aviso
    não pode derrubar a rota de status, que a tela lê para saber da geração.
    """
    cortados = trechos_do_bruto.ler_trechos(bruto)
    if cortados is None:
        return False
    try:
        desvios = mesclar_desvios_sobrepostos(_desvios_do_corte(corte, corte.id))
        inicio, fim = _intervalo_dentro_do_video(corte, projeto)
        atuais = _segmentos_do_bruto(corte, inicio, fim, desvios)
    except ValueError:
        return False
    if len(cortados) != len(atuais):
        return True
    return any(
        abs(ci - ai) > _FOLGA_SEG or abs(cf - af) > _FOLGA_SEG
        for (ci, cf), (ai, af) in zip(cortados, atuais, strict=True)
    )
