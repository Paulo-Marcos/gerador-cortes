"""A geometria da capa do TikTok passa inteira pelo schema (D-722).

As coordenadas são inteiras porque o domínio passa cada uma por `_inteiro`; o
schema declara `int`, e um `float` ali transformaria 50 em 50.0 na resposta.
"""

from app.routers.settings import LayoutCapaTiktokResponse, obter_layout_da_capa_tiktok


def test_a_geometria_resolvida_passa_identica():
    geometria = obter_layout_da_capa_tiktok()

    assert LayoutCapaTiktokResponse.model_validate(geometria).model_dump() == geometria
