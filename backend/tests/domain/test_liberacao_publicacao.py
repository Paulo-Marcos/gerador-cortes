"""D-566: o registro de marcas de publicação por destino.

O valor deste módulo é ser DADO em vez de `if`: os testes aqui guardam a
propriedade que sustenta isso — todo destino declara o próprio "vazio", e nome
desconhecido não vira liberação silenciosa.
"""

from app.domain.publicacao.liberacao_publicacao import (
    DESTINOS,
    destinos_conhecidos,
    marca_do_destino,
)


def test_youtube_limpa_as_tres_marcas_do_mesmo_evento():
    """id, URL e agendamento saem juntos.

    Liberar pela metade deixaria tela e backend discordando: o botão de enviar
    voltaria (olha a URL) e o upload continuaria recusando (olha o video_id).
    """
    marca = marca_do_destino("youtube")

    assert marca.campos == (
        "youtube_video_id",
        "youtube_url_publicado",
        "youtube_scheduled_at",
    )
    assert all(vazio == "" for _, vazio in marca.limpar)


def test_tiktok_declara_none_como_vazio():
    """O carimbo de data não tem string vazia — o destino diz o próprio vazio."""
    marca = marca_do_destino("tiktok")

    assert marca.limpar == (("tiktok_publicado_em", None),)


def test_nome_tolerante_a_espaco_e_maiuscula():
    assert marca_do_destino(" YouTube ") is DESTINOS["youtube"]


def test_destino_desconhecido_nao_vira_liberacao_silenciosa():
    assert marca_do_destino("instagram") is None
    assert marca_do_destino("") is None
    assert marca_do_destino(None) is None


def test_destinos_conhecidos_lista_o_registro():
    assert destinos_conhecidos() == ("youtube", "tiktok")
