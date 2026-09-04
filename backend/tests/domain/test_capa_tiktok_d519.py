"""D-519: a geometria e o texto da capa vertical do TikTok.

O que precisa de guarda aqui não é o desenho bonito — é o QUADRADO CENTRAL. A
grade do perfil recorta a capa, e as fontes de 2026 divergem entre corte 1:1 e
~3:4. Se uma faixa escapar do quadrado de 1080x1080, o sintoma não aparece na
imagem gerada (que sai perfeita) e sim no perfil, depois de publicado: a etiqueta
cortada pela metade, ou o selo sumido.

O segundo alvo é a etiqueta. A skill do YouTube manda a manchete INTEIRA; se
esse texto vazar para cá, a capa vira um parágrafo ilegível em miniatura.
"""

from app.domain.capa_tiktok import (
    BASE_SEGURA,
    LARGURA,
    MARGEM_DO_CHROME,
    MAX_CARACTERES_DA_ETIQUETA,
    TOPO_SEGURO,
    instante_do_frame,
    montar_layout,
    normalizar_etiqueta,
)


class TestQuadradoSeguro:
    def test_todas_as_faixas_cabem_no_quadrado_central(self):
        assert montar_layout().cabe_no_quadrado_seguro

    def test_nenhuma_faixa_invade_a_zona_recortada(self):
        """Checagem faixa a faixa, e não só das pontas do bloco."""
        layout = montar_layout()

        for nome, faixa in layout.como_dict().items():
            assert faixa["y"] >= TOPO_SEGURO, f"{nome} comeca acima do quadrado seguro"
            assert faixa["y"] + faixa["h"] <= BASE_SEGURA, f"{nome} passa do quadrado seguro"

    def test_o_frame_e_16_por_9(self):
        """A faixa central cita o formato do vídeo; distorcê-la seria mentir."""
        frame = montar_layout().frame

        assert round(frame.w / frame.h, 2) == 1.78

    def test_o_frame_encosta_no_trilho_do_chrome(self):
        """Sangrado ate a borda, ele atravessaria o contorno do palco."""
        frame = montar_layout().frame

        assert frame.x == MARGEM_DO_CHROME
        assert frame.x + frame.w == LARGURA - MARGEM_DO_CHROME

    def test_as_faixas_nao_se_sobrepoem(self):
        """Sobreposição aqui seria texto por cima do vídeo, sem ninguém pedir."""
        layout = montar_layout()

        assert layout.etiqueta.y + layout.etiqueta.h <= layout.frame.y
        assert layout.frame.y + layout.frame.h <= layout.selo.y


class TestEtiqueta:
    def test_corta_pelo_numero_de_palavras(self):
        longa = "primeira segunda terceira quarta quinta sexta setima"

        assert len(normalizar_etiqueta(longa).split()) <= 5

    def test_a_manchete_inteira_do_youtube_nao_passa(self):
        """O caso que motivou o módulo: o texto do cartaz vazando para a vitrine."""
        manchete = "O erro que todo mundo comete com juros compostos e nunca percebe"

        etiqueta = normalizar_etiqueta(manchete)

        assert len(etiqueta) <= MAX_CARACTERES_DA_ETIQUETA

    def test_nunca_corta_no_meio_de_uma_palavra(self):
        """Palavra partida parece defeito de renderização, não edição."""
        texto = "internacionalizacao monetaria brasileira contemporanea"

        etiqueta = normalizar_etiqueta(texto)

        for palavra in etiqueta.split():
            assert palavra in texto.upper()

    def test_sobe_para_caixa_alta(self):
        assert normalizar_etiqueta("juro composto") == "JURO COMPOSTO"

    def test_texto_vazio_devolve_vazio_sem_quebrar(self):
        assert normalizar_etiqueta("") == ""
        assert normalizar_etiqueta("   ") == ""

    def test_uma_palavra_gigante_nao_vira_etiqueta(self):
        """Cair para vazio é melhor que estourar a faixa com uma palavra só."""
        assert normalizar_etiqueta("a" * 60) == ""


class TestInstanteDoFrame:
    def test_pega_o_primeiro_terco(self):
        assert instante_do_frame(120.0) == 40.0

    def test_video_de_duracao_zero_nao_quebra(self):
        assert instante_do_frame(0.0) == 0.0

    def test_duracao_negativa_vira_zero(self):
        """`probe_duracao` pode devolver lixo; o instante nunca pode ser negativo."""
        assert instante_do_frame(-10.0) == 0.0
