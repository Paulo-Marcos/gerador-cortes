"""D-1012: o que a auditoria da D-1010 deixou aberto, com o contrato de cada detalhe."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.business_suite_reels import Passo
from app.domain.publicacao.escalonamento import DESTINOS_ESCALONADOS, destino_de
from app.domain.publicacao.publicacao import NAO_PUBLIQUEI_SEM_CAPA, Plataforma
from app.domain.publicacao.ritmo_publicacao import EstadoItem
from app.infrastructure import instagram_graph
from app.services import business_suite_reels as robo
from app.services import instagram_api
from app.services import publicacao_lote as lote_svc
from app.services.itens_do_lote import escolher_recado_da_aba

from tests.services.test_business_suite_reels_d1010 import PaginaFalsa

QUANDO = Agendamento.de_texto("2026-11-09T19:35")


@pytest.mark.parametrize("plataforma", list(Plataforma))
def test_toda_plataforma_do_lote_tem_agenda(plataforma):
    """É o que permite não haver ramo "publica no ato": rede nova que não escalone cai aqui."""
    assert destino_de(plataforma.value) in DESTINOS_ESCALONADOS


def test_capa_que_nao_entrou_deixa_o_aviso_mesmo_sem_publicar_sozinho(monkeypatch, tmp_path):
    """A negativa traz a instrução: quem está na aba precisa dela, com ou sem o clique."""
    monkeypatch.setattr(robo.conta_do_destino, "conferir_conta", lambda *_: None)
    capa = tmp_path / "capa.jpg"
    capa.write_bytes(b"c")

    relatorio = robo.executar_roteiro(
        PaginaFalsa(ausentes={"capa_trocada"}),
        video=tmp_path / "reel.mp4",
        legenda="legenda",
        capa=capa,
        agendamento=QUANDO,
        publicar_sozinho=False,
    )

    assert NAO_PUBLIQUEI_SEM_CAPA in relatorio["avisos"]


def test_o_clique_sozinho_pede_a_legenda_confirmada():
    assert robo._pode_clicar_sozinho(None, [Passo.LEGENDA], [])
    assert not robo._pode_clicar_sozinho(None, [], [])


def test_o_recado_nomeia_o_botao_de_cada_caso():
    assert "clique em Publicar" in escolher_recado_da_aba(None)
    com_data = escolher_recado_da_aba(QUANDO)
    assert "botao final" in com_data
    assert "Publicar" not in com_data


@pytest.mark.asyncio
async def test_item_com_data_recebe_o_recado_de_agendar(monkeypatch):
    """A fiação: a data que o item leva é a que escolhe o recado do "sua vez"."""
    capturado: dict = {}

    def robo(_plataforma, **kwargs):
        capturado.update(kwargs)
        return "destino"

    detalhes: list[tuple[EstadoItem, str]] = []

    async def mudar(_item, estado, **kwargs):
        detalhes.append((estado, kwargs["detalhe"]))

    monkeypatch.setattr(lote_svc, "_robo_do_lote", lambda *_: robo)
    monkeypatch.setattr(lote_svc, "_mudar", mudar)
    item = SimpleNamespace(
        plataforma=Plataforma.INSTAGRAM_REELS,
        espera=None,
        agendamento_efetivo=lambda _do_lote: QUANDO,
    )
    lote = SimpleNamespace(opcoes=SimpleNamespace(agendamento=None, publicar_sozinho=False))

    lote_svc._destino_do_item(item, lote)
    await capturado["ao_ficar_pronta"]()

    assert detalhes == [(EstadoItem.SUA_VEZ, escolher_recado_da_aba(QUANDO))]


@pytest.mark.asyncio
async def test_a_api_manda_usar_o_modo_agora():
    """A tela não tem como "tirar a data": quem publica na hora é o modo Agora."""
    destino = instagram_api.DestinoInstagramReelsApi(agendamento=QUANDO)

    with pytest.raises(instagram_graph.ErroDoInstagram) as erro:
        await destino.publicar(SimpleNamespace())

    assert "modo Agora" in str(erro.value)
    assert "Tire a data" not in str(erro.value)
