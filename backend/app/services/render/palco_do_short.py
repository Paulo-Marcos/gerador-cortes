"""O que o palco do short desenha: o PNG, a textura e as máscaras de canto.

Saiu do `render_short.py` (D-911), que está no teto de tamanho: o render monta
o quadro; quem decide o que o PALCO põe nele mora aqui.

As máscaras: no estilo limpo toda janela do short tem os cantos arredondados.
O PNG arredonda as janelas que se apoiam no FUNDO; a do insert pousa em cima do
vídeo da pessoa, onde o PNG não alcança. Para essa, o FFmpeg recorta os cantos
com uma máscara (`alphamerge`).
"""

from __future__ import annotations

from pathlib import Path

from app.core import channel_paths
from app.domain.corte.youtube_layout import FUNDO_PADRAO as FUNDO_EDITORIAL_PADRAO
from app.domain.corte.youtube_layout import _normalizar_fundo as textura_valida
from app.domain.short import moldura_short
from app.domain.short.palco_short import PlanoPalco
from app.infrastructure.imagem.mascara_arredondada import mascara_arredondada
from app.services import palco_componentes, palco_short_png


async def palco_em_png(palco: dict):
    """O PNG do palco deste short, ou `None` para seguir sem ele (D-508).

    O fundo EDITORIAL (a textura) e a cor do fundo são coisas diferentes: a cor
    preenche o que sobra dentro do ffmpeg, e a textura vem no PNG. Enquanto o
    seletor da tela ainda oferece cores da paleta, a textura fica no default do
    canal — trocá-la é a D-509.
    """
    if moldura_short.Moldura(palco["moldura"]) is moldura_short.Moldura.NENHUMA:
        return None

    plano = palco.get("plano")
    if plano is None:
        # D-543: sem plano de palco o render degrada para o recorte 9:16 do
        # quadro cru — mas a MOLDURA nao precisa degradar junto. Aqui a janela e
        # uma so, o que sobra entre as duas faixas, e o palco texturizado serve
        # aos dois caminhos. Sem isto, um corte sem preset saia com duas barras
        # de verde chapado.
        janela = moldura_short.janela_entre_as_faixas(palco["moldura"])
        return await palco_short_png.obter(textura_do_short(palco), [janela] if janela else [])

    janelas = [recorte.janela for recorte in plano.recortes]
    return await palco_short_png.obter(textura_do_short(palco), janelas)


def textura_do_short(palco: dict) -> str:
    """A textura escolhida para este short, ou a padrao do canal (D-552).

    O PNG e a PREVIA leem daqui. Duas fontes para este id fariam a tela e o
    arquivo divergirem sem nada quebrar — que e como a D-549 nasceu.
    """
    # D-554: `or` so pega o vazio. Um id que nao e textura (uma chave de
    # paleta vinda de preset antigo) passaria por aqui e o rasterizador
    # procuraria um fundo inexistente.
    return textura_valida(palco.get("fundo_editorial"), FUNDO_EDITORIAL_PADRAO)


# Espelha `RAIO_DA_JANELA_DO_SHORT` em video-renderer/src/youtube-bg/palco-limpo.tsx.
RAIO_DA_JANELA_DO_SHORT = 24


def pasta_das_mascaras() -> Path:
    """O cache das máscaras: regenerável, junto do cache do palco do canal."""
    return channel_paths.palco_cache_dir() / "mascaras"


def mascaras_do_insert(palco: dict) -> dict[int, Path]:
    """`{índice do recorte: PNG da máscara}` das janelas que ficam POR CIMA de outra.

    Vazio fora do estilo limpo, sem palco (moldura desligada) ou sem plano: o
    short sai como saía, sem passo extra no FFmpeg.
    """
    plano = palco.get("plano")
    if not isinstance(plano, PlanoPalco):
        return {}
    if moldura_short.Moldura(palco["moldura"]) is moldura_short.Moldura.NENHUMA:
        return {}
    if palco_componentes.ler().estilo != "limpo":
        return {}
    pasta = pasta_das_mascaras()
    return {
        indice: mascara_arredondada(
            plano.recortes[indice].janela["w"],
            plano.recortes[indice].janela["h"],
            RAIO_DA_JANELA_DO_SHORT,
            pasta,
        )
        for indice in plano.sobrepostos()
    }
