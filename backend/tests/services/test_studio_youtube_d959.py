"""A edição em massa leva também os 3 vídeos do topo de cada aba (D-959).

Às vezes o Studio deixa um vídeo sem monetizar. Marcando sempre os 3 mais
recentes da aba junto com o lote, o que escapou numa rodada é pego na seguinte.

Pedido → teste:
  - sempre os 3 últimos vídeos, além do lote → `test_marca_os_tres_do_topo_*`
  - vídeo que escapou na rodada anterior é pego na seguinte → `test_o_que_escapou_*`
  - nas duas abas (Vídeos e Shorts) → `test_cada_aba_leva_os_seus_tres_do_topo`
  - um vídeo marcado uma vez só, e no máximo 3 do topo → `test_com_os_recentes_*`
  - o id sai do link da linha → `test_id_da_linha_*`
"""

import pytest
from app.domain.publicacao import studio_youtube as dominio
from app.domain.publicacao.studio_youtube import TarefaNoStudio
from app.services import studio_youtube

from tests.services.test_studio_youtube_d895 import CANAL, PaginaFalsa

CORTE = "corteLongo1"
SHORT = "shortCurto1"
ANTIGO = "corteDeOnte"
VELHO = "corteAntigo"


class PaginaComTopo(PaginaFalsa):
    """O dublê com o topo de cada aba: os ids das primeiras linhas, do mais novo ao mais velho."""

    def __init__(self, *, topo_videos=(), topo_shorts=(), **kwargs):
        super().__init__(**kwargs)
        self.topo = {False: list(topo_videos), True: list(topo_shorts)}

    def ids_no_topo(self, alvo, quantos, *, segundos):
        return self.topo[self.url.endswith("/short")][:quantos]


def _marcados(pagina):
    return [p[1] for p in pagina.passos if p[0] == "marcar"]


def test_marca_os_tres_do_topo_junto_com_o_lote():
    pagina = PaginaComTopo(topo_videos=[CORTE, ANTIGO, VELHO, "quartoVideo"])

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert falhas == []
    assert _marcados(pagina) == [CORTE, ANTIGO, VELHO], "o lote, depois o topo sem repetir"
    assert pagina.passos.count(("clicar", "confirmar")) == 1, "uma edição só"


def test_o_que_escapou_na_rodada_anterior_e_pego_na_seguinte():
    """O ANTIGO ficou sem monetizar ontem; hoje só o CORTE subiu, e o ANTIGO vai junto."""
    pagina = PaginaComTopo(topo_videos=[CORTE, ANTIGO])

    studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert ANTIGO in _marcados(pagina)


def test_cada_aba_leva_os_seus_tres_do_topo():
    pagina = PaginaComTopo(topo_videos=[ANTIGO], topo_shorts=["shortDeOnte"])

    studio_youtube.executar_roteiro(
        pagina,
        [TarefaNoStudio(CORTE, monetizar=True), TarefaNoStudio(SHORT, monetizar=True, short=True)],
    )

    assert pagina.url == dominio.url_da_lista(CANAL, shorts=True)
    assert _marcados(pagina) == [CORTE, ANTIGO, SHORT, "shortDeOnte"]


def test_com_os_recentes_nao_repete_e_para_em_tres():
    assert dominio.com_os_recentes(["a", "b"], ["b", "c", "d", "e"]) == ["a", "b", "c", "d"]


@pytest.mark.parametrize(
    ("href", "esperado"),
    [
        ("/video/abcdefghijk/edit", "abcdefghijk"),
        ("https://studio.youtube.com/video/a-b_c123456/analytics", "a-b_c123456"),
        ("/channel/UCx/videos", ""),
        (None, ""),
    ],
)
def test_id_da_linha_sai_do_link_do_studio(href, esperado):
    assert dominio.id_da_linha(href) == esperado


class TopoQueQuebra(PaginaComTopo):
    def ids_no_topo(self, alvo, quantos, *, segundos):
        raise RuntimeError("Timeout 5000ms exceeded")


def test_topo_que_nao_se_le_nao_derruba_o_lote():
    """Os 3 do topo são a rede de segurança: se a leitura falhar, o lote sai mesmo assim."""
    pagina = TopoQueQuebra()

    falhas = studio_youtube.executar_roteiro(pagina, [TarefaNoStudio(CORTE, monetizar=True)])

    assert falhas == []
    assert _marcados(pagina) == [CORTE]
