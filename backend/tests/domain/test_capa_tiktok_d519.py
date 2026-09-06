"""D-519: a geometria e o texto da capa vertical do TikTok.

O que precisa de guarda aqui não é o desenho bonito — é o QUADRADO CENTRAL. A
grade do perfil recorta a capa, e as fontes de 2026 divergem entre corte 1:1 e
~3:4. Se o TEXTO escapar do quadrado de 1080x1080, o sintoma não aparece na
imagem gerada (que sai perfeita) e sim no perfil, depois de publicado: a etiqueta
cortada pela metade, ou o selo sumido.

O SELO é a exceção deliberada: ele fica fora do quadrado (D-531), porque na
grade do perfil o handle é redundante e prendê-lo ali custaria altura da arte.

O segundo alvo é a etiqueta. A skill do YouTube manda a manchete INTEIRA; se
esse texto vazar para cá, a capa vira um parágrafo ilegível em miniatura.
"""

from app.domain.capa_tiktok import (
    ALTURA,
    BASE_SEGURA,
    LADO_MINIMO,
    LARGURA,
    MARGEM_DO_CHROME,
    MAX_CARACTERES_DA_ETIQUETA,
    TOPO_SEGURO,
    Faixa,
    encaixar,
    etiqueta_da_resposta,
    instante_do_frame,
    layout_padrao,
    montar_layout,
    normalizar_etiqueta,
    prompt_da_arte,
)


class TestGeometria:
    def test_a_etiqueta_cabe_no_quadrado_central(self):
        assert montar_layout().cabe_no_quadrado_seguro

    def test_nada_passa_por_cima_da_arte(self):
        """D-531: o que a primeira capa real quebrou.

        Com o texto sobreposto, a etiqueta caiu exatamente sobre o rosto do
        personagem — o unico elemento que a capa tinha para vender. As faixas
        voltaram a ser vizinhas, e este teste e o que impede a volta.
        """
        layout = montar_layout()

        assert layout.etiqueta.y + layout.etiqueta.h <= layout.frame.y
        assert layout.frame.y + layout.frame.h <= layout.selo.y

    def test_a_arte_e_4_por_5(self):
        """Vertical, e nao deitada: a capa e vista num celular."""
        arte = montar_layout().frame

        assert round(arte.w / arte.h, 2) == 0.8

    def test_a_arte_esta_contida_no_quadro(self):
        arte = montar_layout().frame

        assert arte.x >= 0
        assert arte.x + arte.w <= LARGURA

    def test_a_arte_e_centrada_na_largura(self):
        arte = montar_layout().frame

        assert abs(arte.x - (LARGURA - arte.w - arte.x)) <= 1

    def test_a_etiqueta_fica_dentro_do_quadrado_seguro(self):
        """E ela que precisa sobreviver ao recorte da grade do perfil."""
        etiqueta = montar_layout().etiqueta

        assert etiqueta.y >= TOPO_SEGURO
        assert etiqueta.y + etiqueta.h <= BASE_SEGURA

    def test_o_selo_fica_fora_do_quadrado_seguro_de_proposito(self):
        """Na grade do perfil o handle e redundante — quem olha ja esta la.

        Prende-lo ao quadrado custaria altura da arte por nada. O teste existe
        para que isso seja lido como decisao, e nao como descuido.
        """
        selo = montar_layout().selo

        assert selo.y > BASE_SEGURA

    def test_o_selo_nao_encosta_na_borda_do_quadro(self):
        """Embaixo dele passa o trilho do chrome; encostado, os dois brigam."""
        selo = montar_layout().selo

        assert selo.y + selo.h <= ALTURA - MARGEM_DO_CHROME


class TestEtiqueta:
    def test_nao_apaga_palavra_de_texto_curado(self):
        """D-533: o defeito que o dev viu, em uma linha.

        O texto vem do `texto_capa`, escrito a mao para a thumbnail do YouTube.
        Sumir com a ultima palavra dele e silencioso, e por isso pior que
        qualquer corpo de fonte pequeno — quem resolve o espaco agora e o
        renderizador, encolhendo a fonte e usando ate tres linhas.
        """
        for texto in (
            "TODO MUNDO ASSINOU EMBAIXO",
            "BANCO ANTISSISTEMA, CORRUPCAO IGUAL",
            "NAO TEM PAIS QUE SOBREVIVE",
        ):
            assert normalizar_etiqueta(texto) == texto

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

    def test_uma_palavra_gigante_sobrevive(self):
        """Ela nao cabe bem, mas apaga-la deixaria a capa sem etiqueta nenhuma."""
        assert normalizar_etiqueta("a" * 60) == "A" * 60

    def test_paragrafo_inteiro_ainda_e_cortado(self):
        """A guarda que restou: acima disso nem tres linhas salvam."""
        paragrafo = " ".join(["palavra"] * 40)

        assert len(normalizar_etiqueta(paragrafo)) <= MAX_CARACTERES_DA_ETIQUETA


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

    def test_resposta_longa_passa_inteira_ate_a_guarda(self):
        """A limpeza tira o embrulho; encurtar o texto e trabalho da skill."""
        resposta = "O erro que todo mundo comete"

        assert etiqueta_da_resposta(resposta) == "O ERRO QUE TODO MUNDO COMETE"


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


class TestAjusteDoOperador:
    """D-532: o operador manda no layout, e o ajuste e PARCIAL.

    Chave ausente herda o padrao — o mesmo mecanismo de heranca do resto da
    cascata de layout deste projeto. Quem move so o titulo grava so o titulo, e
    a arte continua acompanhando qualquer mudanca futura no default.
    """

    def test_sem_ajuste_e_o_padrao(self):
        assert montar_layout(None) == layout_padrao()
        assert montar_layout({}) == layout_padrao()

    def test_mexer_num_componente_nao_move_os_outros(self):
        padrao = layout_padrao()

        layout = montar_layout({"etiqueta": {"y": 120}})

        assert layout.etiqueta.y == 120
        assert layout.frame == padrao.frame
        assert layout.selo == padrao.selo

    def test_campo_ausente_dentro_do_componente_herda(self):
        """Mover no eixo Y nao pode zerar a largura que o operador nao tocou."""
        padrao = layout_padrao()

        etiqueta = montar_layout({"etiqueta": {"y": 120}}).etiqueta

        assert etiqueta.x == padrao.etiqueta.x
        assert etiqueta.w == padrao.etiqueta.w
        assert etiqueta.h == padrao.etiqueta.h

    def test_valor_impossivel_vira_o_mais_proximo_que_cabe(self):
        """JSON editado a mao, ou um default que mudou sob um ajuste antigo."""
        layout = montar_layout({"arte": {"x": 5000, "y": -300}})

        assert 0 <= layout.frame.x <= LARGURA - layout.frame.w
        assert layout.frame.y == 0

    def test_valor_nao_numerico_cai_no_padrao(self):
        padrao = layout_padrao()

        assert montar_layout({"selo": {"y": "meio"}}).selo.y == padrao.selo.y

    def test_componente_desconhecido_e_ignorado(self):
        """Chave estranha no JSON nao pode derrubar a montagem da capa."""
        assert montar_layout({"rodape": {"y": 10}}) == layout_padrao()


class TestEncaixar:
    def test_bloco_minusculo_cresce_ate_o_minimo(self):
        """Abaixo do minimo o bloco some e leva a alca de arraste junto."""
        assert encaixar(Faixa(0, 0, 1, 1)).w == LADO_MINIMO

    def test_bloco_maior_que_o_quadro_encolhe_antes_de_mover(self):
        """Encolher primeiro evita empurrar a origem para negativo so para caber."""
        faixa = encaixar(Faixa(0, 0, 2000, 3000))

        assert faixa.w == LARGURA
        assert faixa.h == ALTURA
        assert faixa.x == 0
