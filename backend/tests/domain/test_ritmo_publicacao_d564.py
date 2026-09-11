"""D-564: o ritmo de cada plataforma, decidido longe de rede e de navegador.

O que estes testes protegem é a razão de o módulo existir: uma fila que trate as
três plataformas igual ou anda no passo da mais lenta, ou estoura a cota da mais
rígida. Aqui a diferença entre elas é dado, não código espalhado.
"""

from datetime import datetime, timedelta

from app.domain.publicacao import Plataforma
from app.domain.ritmo_publicacao import (
    UPLOADS_YOUTUBE_POR_DIA,
    Cadencia,
    EstadoItem,
    cabe_hoje,
    cadencia_de,
    espera_do_proximo,
    motivo_para_parar,
    publicados_no_dia,
)

AGORA = datetime(2026, 9, 10, 20, 0, 0)


def test_a_cota_do_youtube_da_seis_por_dia():
    """1.600 unidades de 10.000: o único teto que é conta, e não estimativa."""
    assert UPLOADS_YOUTUBE_POR_DIA == 6
    assert cadencia_de(Plataforma.YOUTUBE_SHORTS).max_por_dia == 6


def test_so_o_youtube_dispensa_o_humano():
    """É esta diferença que obriga a fila a ter raias, e não uma fila só."""
    assert cadencia_de(Plataforma.YOUTUBE_SHORTS).exige_humano is False
    assert cadencia_de(Plataforma.TIKTOK).exige_humano is True
    assert cadencia_de(Plataforma.TIKTOK_HORIZONTAL).exige_humano is True
    assert cadencia_de(Plataforma.INSTAGRAM_REELS).exige_humano is True


def test_sem_teto_conhecido_cabe_sempre():
    """`max_por_dia = 0` é "não sei", e não "zero" — não pode virar bloqueio."""
    tiktok = cadencia_de(Plataforma.TIKTOK)
    assert tiktok.max_por_dia == 0
    assert cabe_hoje(publicados_hoje=50, cadencia=tiktok) is True


def test_o_youtube_para_no_sexto_do_dia():
    youtube = cadencia_de(Plataforma.YOUTUBE_SHORTS)
    assert cabe_hoje(publicados_hoje=5, cadencia=youtube) is True
    assert cabe_hoje(publicados_hoje=6, cadencia=youtube) is False


def test_o_motivo_de_parar_e_frase_pronta_para_a_tela():
    """Quem lê é o operador às onze da noite, não um dev lendo stack trace."""
    aviso = motivo_para_parar(publicados_hoje=6, cadencia=cadencia_de(Plataforma.YOUTUBE_SHORTS))
    assert aviso is not None
    assert "YouTube Shorts" in aviso
    assert "amanha" in aviso


def test_sem_motivo_para_parar_quando_ainda_cabe():
    assert (
        motivo_para_parar(publicados_hoje=0, cadencia=cadencia_de(Plataforma.YOUTUBE_SHORTS))
        is None
    )


def test_o_intervalo_conta_da_ultima_publicacao_da_raia():
    """E não do início do lote: raias diferentes não se atrasam entre si."""
    ritmo = Cadencia(Plataforma.TIKTOK, max_por_dia=0, intervalo_min_seg=600.0, exige_humano=True)

    assert espera_do_proximo(ultima_em=None, agora=AGORA, cadencia=ritmo) == 0.0
    assert (
        espera_do_proximo(ultima_em=AGORA - timedelta(minutes=2), agora=AGORA, cadencia=ritmo)
        == 480.0
    )
    assert (
        espera_do_proximo(ultima_em=AGORA - timedelta(hours=1), agora=AGORA, cadencia=ritmo) == 0.0
    )


def test_sem_intervalo_configurado_nao_ha_espera():
    """O padrão de hoje: quem dá o passo do TikTok é o clique do operador."""
    assert (
        espera_do_proximo(ultima_em=AGORA, agora=AGORA, cadencia=cadencia_de(Plataforma.TIKTOK))
        == 0.0
    )


def test_o_dia_e_de_calendario_e_nao_janela_de_24h():
    """É assim que a cota do YouTube vira; contar diferente mostraria outro número."""
    ontem_tarde = datetime(2026, 9, 9, 23, 30)
    hoje_cedo = datetime(2026, 9, 10, 0, 30)

    assert publicados_no_dia([ontem_tarde, hoje_cedo], AGORA) == 1
    assert publicados_no_dia([], AGORA) == 0


def test_sua_vez_nao_e_estado_terminal_do_ponto_de_vista_do_lote():
    """O trabalho da máquina acabou, mas o item ainda pode virar publicado."""
    assert EstadoItem.SUA_VEZ.value == "sua_vez"
    assert EstadoItem.SUA_VEZ not in {
        EstadoItem.PUBLICADO,
        EstadoItem.ERRO,
        EstadoItem.PULADO,
        EstadoItem.CANCELADO,
    }
