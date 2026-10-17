"""D-958: o corte deitado não vai ao TikTok sozinho sem a capa vertical (RN-26).

O relato (17/10/2026): no lote do "publicar sozinho", vídeos horizontais
saíram com um quadro qualquer de capa. Um deles não tinha capa vertical
gerada — e "sem capa pedida, publica" deixava o robô apertar Publicar. Para
o corte horizontal a capa vertical é sempre pedida (D-522): faltar ela é o
mesmo que ela não ter entrado.
"""

from pathlib import Path

import pytest
from app.domain.publicacao.publicacao import (
    NAO_PUBLIQUEI_SEM_CAPA_VERTICAL,
    MetadadosBase,
    ModoPublicacao,
    Plataforma,
    adaptar,
)
from app.services import janela_do_robo, publicacao_no_tiktok, tiktok_studio
from app.services.destinos_assistidos import DestinoTikTokAssistido
from app.services.publicacao_destinos import PacotePublicacao


@pytest.fixture
def robo(monkeypatch):
    """O TikTok Studio de mentira: guarda o pedido e publica quando mandado."""
    pedidos: list[dict] = []

    async def subir(**kwargs):
        pedidos.append(kwargs)
        return {"passos": [], "avisos": [], "publicado": kwargs["publicar_sozinho"]}

    monkeypatch.setattr(tiktok_studio, "subir_assistido", subir)
    monkeypatch.setattr(janela_do_robo, "mostrar", lambda perfil: True)
    return pedidos


def _pacote(tmp_path: Path, plataforma: Plataforma, *, com_capa: bool) -> PacotePublicacao:
    video = tmp_path / "video.mp4"
    video.write_bytes(b"video")
    capa = None
    if com_capa:
        capa = tmp_path / "capa_tiktok.png"
        capa.write_bytes(b"png")
    return PacotePublicacao(
        plataforma=plataforma,
        modo=ModoPublicacao.ASSISTIDO,
        arquivo=video,
        capa=capa,
        metadados=adaptar(MetadadosBase(titulo="O corte"), plataforma),
    )


@pytest.mark.asyncio
async def test_lote_nao_publica_sozinho_o_corte_sem_capa_vertical(robo, tmp_path):
    destino = DestinoTikTokAssistido(
        Plataforma.TIKTOK_HORIZONTAL, publicar_sozinho=True, sem_esperar=True
    )

    resultado = await destino.publicar(
        _pacote(tmp_path, Plataforma.TIKTOK_HORIZONTAL, com_capa=False)
    )

    assert robo[0]["publicar_sozinho"] is False
    assert not resultado.get("publicado")
    assert NAO_PUBLIQUEI_SEM_CAPA_VERTICAL in resultado["avisos"]


@pytest.mark.asyncio
async def test_lote_publica_sozinho_o_corte_com_capa_vertical(robo, tmp_path):
    destino = DestinoTikTokAssistido(
        Plataforma.TIKTOK_HORIZONTAL, publicar_sozinho=True, sem_esperar=True
    )

    resultado = await destino.publicar(
        _pacote(tmp_path, Plataforma.TIKTOK_HORIZONTAL, com_capa=True)
    )

    assert robo[0]["publicar_sozinho"] is True
    assert resultado["publicado"] is True


@pytest.mark.asyncio
async def test_o_short_vertical_sem_capa_segue_publicando_sozinho(robo, tmp_path):
    """O short JÁ é 9:16: o quadro que o TikTok escolhe é do próprio short."""
    destino = DestinoTikTokAssistido(Plataforma.TIKTOK, publicar_sozinho=True, sem_esperar=True)

    await destino.publicar(_pacote(tmp_path, Plataforma.TIKTOK, com_capa=False))

    assert robo[0]["publicar_sozinho"] is True


@pytest.mark.asyncio
async def test_botao_do_corte_nao_publica_sozinho_sem_capa_vertical(robo):
    pacote = {"plataforma": "tiktok_horizontal", "titulo": "T", "video": "v.mp4", "capa": ""}

    resultado = await publicacao_no_tiktok.publicar_assistido(pacote, publicar_sozinho=True)

    assert robo[0]["publicar_sozinho"] is False
    assert not resultado.get("publicado")
    assert NAO_PUBLIQUEI_SEM_CAPA_VERTICAL in resultado["avisos"]
