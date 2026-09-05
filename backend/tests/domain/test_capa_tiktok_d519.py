"""D-519: a geometria e o texto da capa vertical do TikTok.

O que precisa de guarda aqui não é o desenho bonito — é o QUADRADO CENTRAL. A
grade do perfil recorta a capa, e as fontes de 2026 divergem entre corte 1:1 e
~3:4. Se o TEXTO escapar do quadrado de 1080x1080, o sintoma não aparece na
imagem gerada (que sai perfeita) e sim no perfil, depois de publicado: a etiqueta
cortada pela metade, ou o selo sumido.

A arte é o contrário: ela sangra além do quadrado de propósito (D-526), e um
teste que a prendesse ali obrigaria a encolhê-la a menos da metade da largura.

O segundo alvo é a etiqueta. A skill do YouTube manda a manchete INTEIRA; se
esse texto vazar para cá, a capa vira um parágrafo ilegível em miniatura.
"""

from app.domain.capa_tiktok import (
    BASE_SEGURA,
    LARGURA,
    MARGEM_DO_CHROME,
    MAX_CARACTERES_DA_ETIQUETA,
    TOPO_SEGURO,
    etiqueta_da_resposta,
    instante_do_frame,
    montar_layout,
    normalizar_etiqueta,
    prompt_da_arte,
)


class TestQuadradoSeguro:
    def test_todas_as_faixas_cabem_no_quadrado_central(self):
        assert montar_layout().cabe_no_quadrado_seguro

    def test_o_texto_nao_invade_a_zona_recortada(self):
        """Checagem faixa a faixa do TEXTO — a arte tem regra própria."""
        layout = montar_layout()

        for nome in ("etiqueta", "selo"):
            faixa = getattr(layout, nome)
            assert faixa.y >= TOPO_SEGURO, f"{nome} comeca acima do quadrado seguro"
            assert faixa.y + faixa.h <= BASE_SEGURA, f"{nome} passa do quadrado seguro"

    def test_a_arte_e_4_por_5(self):
        """D-526: vertical, e não deitada.

        A proporção deitada fazia sentido enquanto a faixa citava um quadro do
        vídeo. Com uma ilustração feita sob medida, sobrava uma tira ocupando um
        terço da altura de uma capa vertical.
        """
        arte = montar_layout().frame

        assert round(arte.w / arte.h, 2) == 0.8

    def test_a_arte_sangra_o_quadrado_seguro(self):
        """De propósito: o recorte da grade mostra o miolo, que é onde o assunto está."""
        arte = montar_layout().frame

        assert arte.y < TOPO_SEGURO
        assert arte.y + arte.h > BASE_SEGURA

    def test_o_frame_encosta_no_trilho_do_chrome(self):
        """Sangrado ate a borda, ele atravessaria o contorno do palco."""
        frame = montar_layout().frame

        assert frame.x == MARGEM_DO_CHROME
        assert frame.x + frame.w == LARGURA - MARGEM_DO_CHROME

    def test_o_texto_fica_sobre_a_arte(self):
        """D-526: agora é camada, não vizinho de faixa.

        Se o texto cair fora da arte, ele volta a boiar sobre o fundo — e os véus
        que garantem a leitura, desenhados dentro da arte, deixam de proteger.
        """
        layout = montar_layout()

        for faixa in (layout.etiqueta, layout.selo):
            assert faixa.y >= layout.frame.y
            assert faixa.y + faixa.h <= layout.frame.y + layout.frame.h


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


class TestRespostaDoModelo:
    """D-520: o contrato de saida da skill e promessa, nao garantia."""

    def test_a_explicacao_embaixo_nao_entra_na_etiqueta(self):
        resposta = "TETO DE GASTOS\n\nEscolhi porque o corte discute o limite."

        assert etiqueta_da_resposta(resposta) == "TETO DE GASTOS"

    def test_tira_aspas_e_crase(self):
        """A aspa entraria na imagem, e ninguem revisa uma capa ja publicada."""
        assert etiqueta_da_resposta('"selic"') == "SELIC"
        assert etiqueta_da_resposta("`selic`") == "SELIC"
        assert etiqueta_da_resposta("“selic”") == "SELIC"

    def test_resposta_vazia_nao_quebra(self):
        assert etiqueta_da_resposta("") == ""
        assert etiqueta_da_resposta("   \n  ") == ""

    def test_resposta_longa_ainda_e_cortada(self):
        """A rede da normalizacao continua valendo depois da limpeza."""
        resposta = "O erro que todo mundo comete com juros compostos"

        assert len(etiqueta_da_resposta(resposta).split()) <= 5


class TestPromptDaArte:
    """D-523: a resposta da skill da arte tambem e promessa, nao garantia."""

    def test_aceita_o_prompt_que_proibe_texto(self):
        prompt = "Editorial illustration of a coin. No text, no letters."

        assert prompt_da_arte(prompt) == prompt

    def test_recusa_uma_pergunta_no_lugar_do_prompt(self):
        """Aconteceu de verdade na primeira execucao.

        Com o corpo da skill ainda no texto generico do template, o modelo
        respondeu pedindo a identidade do mascote. Aquele paragrafo em
        portugues iria para o gerador de imagem e voltaria uma ilustracao de
        nada — sem erro, so uma capa ruim.
        """
        resposta = "Me diga como e o mascote do seu canal e eu devolvo o prompt."

        assert prompt_da_arte(resposta) == ""

    def test_tira_a_cerca_de_markdown(self):
        resposta = "```\nEditorial illustration. No text, no letters.\n```"

        assert prompt_da_arte(resposta) == "Editorial illustration. No text, no letters."

    def test_resposta_vazia_nao_quebra(self):
        assert prompt_da_arte("") == ""
