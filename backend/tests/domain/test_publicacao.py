"""D-467: o que cada plataforma aceita, num lugar só.

Este conhecimento é volátil (os números mudam) e disperso (título aqui, duração
ali). Espalhado pelos destinos, ele vira descoberta na hora do erro — no upload.
Concentrado aqui, vira teste.
"""

from app.domain.publicacao import (
    LIMITES,
    MetadadosBase,
    ModoPublicacao,
    Plataforma,
    adaptar,
    truncar_por_palavra,
    validar,
)


def test_toda_plataforma_tem_limites_declarados():
    """Plataforma sem limites cairia em KeyError no meio de uma publicacao."""
    assert set(LIMITES) == set(Plataforma)


def test_titulo_longo_e_cortado_na_palavra():
    """Terminar em 'o erro que todo mundo com' e pior que terminar antes."""
    base = MetadadosBase(titulo="palavra " * 40)

    titulo = adaptar(base, Plataforma.YOUTUBE_SHORTS).titulo

    assert len(titulo) <= LIMITES[Plataforma.YOUTUBE_SHORTS].titulo_max
    assert not titulo.endswith("palav")


def test_titulo_visivel_e_o_pedaco_que_o_feed_mostra():
    meta = adaptar(MetadadosBase(titulo="a" * 90), Plataforma.YOUTUBE_SHORTS)

    assert len(meta.titulo_visivel) == 40


def test_cta_do_video_longo_entra_quando_ha_url():
    """O short e funil; sem o link ele nao leva a lugar nenhum."""
    base = MetadadosBase(titulo="t", url_video_longo="https://youtu.be/abc")

    assert "https://youtu.be/abc" in adaptar(base, Plataforma.TIKTOK).descricao


def test_sem_url_nao_inventa_cta():
    assert "Corte completo" not in adaptar(MetadadosBase(titulo="t"), Plataforma.TIKTOK).descricao


def test_hashtags_ganham_cerquilha_e_perdem_espaco():
    base = MetadadosBase(titulo="t", hashtags=["taxa de juros", "#economia"])

    assert adaptar(base, Plataforma.TIKTOK).hashtags == ["#taxadejuros", "#economia"]


def test_hashtag_repetida_entra_uma_vez_so():
    base = MetadadosBase(titulo="t", hashtags=["economia", "#economia"])

    assert adaptar(base, Plataforma.TIKTOK).hashtags == ["#economia"]


def test_cada_plataforma_tem_seu_teto_de_hashtags():
    base = MetadadosBase(titulo="t", hashtags=[f"t{i}" for i in range(20)])

    assert len(adaptar(base, Plataforma.YOUTUBE_SHORTS).hashtags) == 3
    assert len(adaptar(base, Plataforma.INSTAGRAM_REELS).hashtags) == 10


def test_reels_recusa_video_curto_demais():
    """Abaixo de 5s o Instagram recusa; melhor saber antes de subir."""
    avisos = validar(Plataforma.INSTAGRAM_REELS, duracao_seg=3, vertical=True)

    assert any("pelo menos" in a for a in avisos)


def test_shorts_aceita_ate_tres_minutos():
    assert validar(Plataforma.YOUTUBE_SHORTS, duracao_seg=179, vertical=True) == []
    assert validar(Plataforma.YOUTUBE_SHORTS, duracao_seg=181, vertical=True)


def test_plataforma_vertical_avisa_sobre_video_horizontal():
    avisos = validar(Plataforma.YOUTUBE_SHORTS, duracao_seg=30, vertical=False)

    assert any("vertical" in a for a in avisos)


def test_tiktok_horizontal_nao_reclama_de_video_deitado():
    """E o unico destino que aceita 16:9 - e ate da impulso a landscape longo."""
    assert validar(Plataforma.TIKTOK_HORIZONTAL, duracao_seg=600, vertical=False) == []


def test_aviso_e_frase_pronta_para_a_tela():
    """Quem le e o operador as onze da noite, nao um dev lendo stack trace."""
    (aviso,) = validar(Plataforma.INSTAGRAM_REELS, duracao_seg=120, vertical=True)

    assert aviso == "Instagram Reels aceita ate 90s; este video tem 120s."


def test_truncar_nao_estraga_texto_curto():
    assert truncar_por_palavra("  espacos   demais ", 100) == "espacos demais"


def test_modos_de_publicacao_sao_tres():
    """API, MANUAL e ASSISTIDO — e o terceiro nasceu do TikTok (D-564).

    Eram dois, e o teste dizia isso. O ASSISTIDO entrou porque o TikTok nao cabe
    em nenhum dos dois: a maquina faz o upload inteiro num Chrome de verdade e
    para no botao Publicar, que e do humano. Chamar isso de API mentiria sobre
    quem termina o trabalho; chamar de manual apagaria os quatro passos que o
    robo ja fez.
    """
    assert {m.value for m in ModoPublicacao} == {"api", "manual", "assistido"}
