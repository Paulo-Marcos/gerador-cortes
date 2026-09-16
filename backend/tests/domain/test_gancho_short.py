"""D-565: o titulo-gancho da abertura do short.

O que precisa de guarda aqui nao e a estetica do cartao — e a fronteira entre o
gancho e o resto. Tres coisas quebram em silencio se ninguem vigiar:

1. **Apagar palavra.** A etiqueta da capa ja cometeu esse erro (D-533): cortava
   por palavras para caber num corpo fixo, e "TODO MUNDO ASSINOU EMBAIXO" virava
   "TODO MUNDO ASSINOU...". O gancho nasce com a licao aprendida.
2. **Estourar a composicao.** O operador encurta o trecho DEPOIS de escrever o
   gancho. Sem o corte contra a duracao do short, o Remotion receberia uma
   sequencia maior que a composicao.
3. **Duracao ilegivel.** Numero torto vindo do banco nao pode custar o render.
"""

import pytest
from app.domain.gancho_short import (
    DURACAO_MAX_SEG,
    DURACAO_MIN_SEG,
    DURACAO_PADRAO_SEG,
    MAX_CARACTERES,
    MAX_VARIACOES,
    PALAVRAS_MAX,
    PALAVRAS_MIN,
    TAMANHO_MAX,
    TAMANHO_MIN,
    aparencia_resolvida,
    contar_palavras,
    esta_na_faixa,
    ganchos_da_resposta,
    normalizar_duracao,
    normalizar_gancho,
    normalizar_preset,
    normalizar_tamanho,
    para_payload,
)


class TestPresetDoGancho:
    """D-594: o preset de gancho e PARCIAL — vazio e zero sao "nao decido"."""

    def test_guarda_so_o_que_foi_decidido(self):
        assert normalizar_preset({"cor": "#FACC15", "realce": "caixa"}) == {
            "cor": "#facc15",
            "realce": "caixa",
            "fonte": "",
            "tamanho": 0.0,
            "duracao": 0.0,
            # D-600: o lugar tambem e parcial — 0 e "este preset nao decide onde".
            "x": 0.0,
            "y": 0.0,
            "largura": 0.0,
        }

    def test_o_lugar_entra_no_preset_e_fica_na_faixa(self):
        """D-600: o preset pode carregar o lugar, e valor fora do quadro e cortado."""
        preset = normalizar_preset({"x": 30, "y": 60, "largura": 500})
        assert (preset["x"], preset["y"], preset["largura"]) == (30.0, 60.0, 100.0)

    def test_valores_tortos_viram_nao_decidido_ou_faixa(self):
        preset = normalizar_preset({"realce": "neon", "tamanho": 0.1, "duracao": 99})
        assert preset["realce"] == ""
        assert preset["tamanho"] == TAMANHO_MIN
        assert preset["duracao"] == DURACAO_MAX_SEG

    def test_tamanho_ausente_e_o_corpo_de_sempre(self):
        assert normalizar_tamanho(None) == 1.0


class TestAparenciaResolvida:
    """A heranca viva do gancho: o trecho decide, ou segue o padrao do corte."""

    def test_o_trecho_que_nao_decidiu_segue_o_padrao(self):
        resolvida = aparencia_resolvida(
            {"cor": "", "realce": "", "ate_seg": 0.0},
            {"cor": "#facc15", "realce": "caixa", "fonte": "Anton", "tamanho": 1.2, "duracao": 3.0},
        )
        assert resolvida == {
            "cor": "#facc15",
            "realce": "caixa",
            "ate_seg": 3.0,
            "fonte": "Anton",
            "tamanho": 1.2,
            # D-600: nenhum dos dois decidiu o lugar — o render cai no de sempre.
            "x": 0.0,
            "y": 0.0,
            "largura": 0.0,
        }

    def test_o_lugar_do_trecho_vence_o_do_padrao(self):
        """D-600: o LUGAR existe nos dois lados, ao contrario da fonte e do corpo.

        Fonte e corpo sao identidade do canal e por isso so moram no preset; o
        lugar depende do que esta no quadro, e o quadro muda a cada trecho.
        """
        resolvida = aparencia_resolvida(
            {"y": 62.0, "largura": 0.0},
            {"x": 30.0, "y": 18.0, "largura": 50.0},
        )
        assert resolvida["y"] == 62.0
        assert resolvida["x"] == 30.0
        assert resolvida["largura"] == 50.0

    def test_o_que_o_trecho_decidiu_vence(self):
        resolvida = aparencia_resolvida(
            {"cor": "#ff5a72", "realce": "", "ate_seg": 2.0},
            {"cor": "#facc15", "realce": "contorno", "duracao": 4.0},
        )
        assert resolvida["cor"] == "#ff5a72"
        assert resolvida["realce"] == "contorno"
        assert resolvida["ate_seg"] == 2.0

    def test_fonte_e_tamanho_sao_so_do_padrao(self):
        """Oito trechos do mesmo corte com oito corpos diferentes nao e identidade."""
        resolvida = aparencia_resolvida({"fonte": "Oswald", "tamanho": 1.5}, None)
        assert resolvida["fonte"] == ""
        assert resolvida["tamanho"] == 0.0

    def test_o_texto_nunca_herda(self):
        resolvida = aparencia_resolvida({}, {"texto": "o juro te come", "cor": "#facc15"})
        assert "texto" not in resolvida


class TestNormalizarGancho:
    def test_colapsa_espaco_sem_mexer_nas_palavras(self):
        assert normalizar_gancho("  ninguem   te   conta   isso ") == "Ninguem te conta isso"

    def test_preserva_a_caixa_que_o_operador_escreveu(self):
        """Diferente da etiqueta da capa, que e rotulo: o gancho e frase lida."""
        assert normalizar_gancho("Ninguem te conta ISSO") == "Ninguem te conta ISSO"

    def test_nao_apaga_palavra_de_um_gancho_normal(self):
        texto = "O erro que todo mundo comete"
        assert normalizar_gancho(texto) == texto

    def test_primeira_letra_sobe_para_maiuscula(self):
        """Tudo em minusculo parece digitado as pressas no short."""
        assert normalizar_gancho("o PIX mudou tudo") == "O PIX mudou tudo"

    def test_corta_so_no_absurdo(self):
        gigante = " ".join(["palavra"] * 40)
        assert len(normalizar_gancho(gigante)) <= MAX_CARACTERES

    def test_vazio_continua_vazio(self):
        assert normalizar_gancho("") == ""
        assert normalizar_gancho("   ") == ""


class TestFaixaDePalavras:
    @pytest.mark.parametrize("quantidade", [PALAVRAS_MIN, 5, 6, PALAVRAS_MAX])
    def test_dentro_da_faixa(self, quantidade):
        assert esta_na_faixa(" ".join(["x"] * quantidade))

    @pytest.mark.parametrize("quantidade", [0, 1, PALAVRAS_MIN - 1, PALAVRAS_MAX + 1])
    def test_fora_da_faixa(self, quantidade):
        assert not esta_na_faixa(" ".join(["x"] * quantidade))

    def test_conta_ignorando_espaco_extra(self):
        assert contar_palavras("  a   b  ") == 2


class TestNormalizarDuracao:
    def test_valor_util_passa_intacto(self):
        assert normalizar_duracao(3.0) == 3.0

    def test_curto_demais_sobe_para_o_minimo(self):
        """Abaixo de 1,5s a frase e vista, nao lida."""
        assert normalizar_duracao(0.2) == DURACAO_MIN_SEG

    def test_longo_demais_desce_para_o_maximo(self):
        assert normalizar_duracao(30.0) == DURACAO_MAX_SEG

    @pytest.mark.parametrize("torto", [None, "", "abc", 0, -5])
    def test_valor_ilegivel_cai_no_padrao(self, torto):
        assert normalizar_duracao(torto) == DURACAO_PADRAO_SEG


class TestPayload:
    def test_gancho_escrito_vira_payload(self):
        assert para_payload("ninguem te conta isso", 2.5, duracao_short_seg=30.0) == {
            "texto": "Ninguem te conta isso",
            "ateSeg": 2.5,
            # D-581: a aparencia viaja JUNTO do texto, e os defaults sao os de
            # antes desta demanda — branco com o veu de topo. Um short curado
            # antes dela sai exatamente como saia.
            "cor": "",
            "realce": "veu",
            "fonte": "",
            "tamanho": 1.0,
            # D-600: o lugar sai SEMPRE preenchido, e os defaults sao os numeros
            # que estavam cravados no renderer ate esta demanda.
            "x": 50.0,
            "y": 18.0,
            "largura": 86.0,
        }

    def test_o_lugar_escolhido_chega_ao_renderer(self):
        """D-600: quem resolveu a heranca foi quem chamou; aqui so se normaliza."""
        payload = para_payload("oi", 2.5, duracao_short_seg=30.0, x=20, y=70, largura=40)
        assert payload is not None
        assert (payload["x"], payload["y"], payload["largura"]) == (20.0, 70.0, 40.0)

    def test_fonte_e_tamanho_chegam_normalizados(self):
        """D-594: o tamanho e escala, travada na faixa em que a frase se le."""
        payload = para_payload("oi", 2.5, duracao_short_seg=30.0, fonte=" Anton ", tamanho=4.0)
        assert payload is not None
        assert payload["fonte"] == "Anton"
        assert payload["tamanho"] == TAMANHO_MAX

    def test_aparencia_escolhida_chega_normalizada(self):
        payload = para_payload("oi", 2.5, duracao_short_seg=30.0, cor="#FACC15", realce="CAIXA")
        assert payload is not None
        assert payload["cor"] == "#facc15"
        assert payload["realce"] == "caixa"

    def test_aparencia_invalida_degrada_em_vez_de_quebrar(self):
        """Um valor torto no banco nao pode custar o render do short."""
        payload = para_payload("oi", 2.5, duracao_short_seg=30.0, cor="vermelho", realce="neon")
        assert payload is not None
        assert payload["cor"] == ""
        assert payload["realce"] == "veu"

    def test_sem_texto_nao_ha_gancho(self):
        """Short sem gancho e o caso comum, nao um erro."""
        assert para_payload("", 2.5, duracao_short_seg=30.0) is None
        assert para_payload("   ", 2.5, duracao_short_seg=30.0) is None

    def test_nao_ultrapassa_a_duracao_do_short(self):
        """O operador encurta o trecho depois de escrever o gancho."""
        payload = para_payload("oi", 5.0, duracao_short_seg=3.0)
        assert payload is not None
        assert payload["ateSeg"] == 3.0

    def test_short_sem_duracao_conhecida_mantem_a_duracao_pedida(self):
        payload = para_payload("oi", 2.5, duracao_short_seg=0.0)
        assert payload is not None
        assert payload["ateSeg"] == 2.5


class TestGanchosDaResposta:
    """O que o modelo devolve nunca e exatamente o que o contrato pediu.

    A etiqueta da capa ja pagou por essa licao (D-520): sem limpeza, a frase
    "Aqui estao as opcoes:" vira a primeira variacao — e o operador le isso como
    um gancho que a maquina propos a serio.
    """

    def test_uma_por_linha_e_o_caso_feliz(self):
        assert ganchos_da_resposta("o juro trabalha contra voce\nninguem te conta isso") == [
            "O juro trabalha contra voce",
            "Ninguem te conta isso",
        ]

    @pytest.mark.parametrize(
        "linha",
        [
            '1. "o erro que todo mundo comete"',
            "- o erro que todo mundo comete",
            "2) o erro que todo mundo comete",
            "• o erro que todo mundo comete",
            "  `o erro que todo mundo comete`  ",
            "“o erro que todo mundo comete”",
        ],
    )
    def test_tira_o_enfeite_que_o_modelo_poe(self, linha):
        assert ganchos_da_resposta(linha) == ["O erro que todo mundo comete"]

    def test_cerca_de_markdown_nao_vira_variacao(self):
        assert ganchos_da_resposta("```\numa opcao aqui\n```") == ["Uma opcao aqui"]

    def test_repetida_entra_uma_vez_so(self):
        """Duas linhas iguais na tela parecem defeito, nao escolha."""
        assert ganchos_da_resposta("mesma frase aqui\nMESMA FRASE AQUI") == ["Mesma frase aqui"]

    def test_para_no_teto_de_variacoes(self):
        muitas = "\n".join(f"variacao numero {i} aqui" for i in range(20))
        assert len(ganchos_da_resposta(muitas)) == MAX_VARIACOES

    @pytest.mark.parametrize("nada", ["", "   ", "\n\n"])
    def test_resposta_vazia_devolve_lista_vazia(self, nada):
        """A tela diz que nao saiu nada; oferecer lixo seria pior."""
        assert ganchos_da_resposta(nada) == []


class TestRessalvaEHistorico:
    """Defeitos vistos na PRIMEIRA execucao real do gerador (D-565).

    O modelo devolveu `o juro composto trabalha contra voce (ja usado — evitar)`:
    ele leu a regra de nao repetir, concordou com ela, e escolheu COMENTA-LA em
    vez de obedece-la. A ressalva iria para a tela como parte da frase.

    Duas licoes, e as duas viraram codigo: parenteses no fim de um gancho e
    sempre meta, e o que o prompt PEDE o parser tem de GARANTIR.
    """

    def test_ressalva_no_fim_nao_vai_para_a_tela(self):
        assert ganchos_da_resposta("seu financiamento custa o dobro (mais forte)") == [
            "Seu financiamento custa o dobro"
        ]

    def test_a_linha_que_so_tem_ressalva_e_descartada(self):
        assert ganchos_da_resposta("(estas sao as opcoes)") == []

    def test_parenteses_no_meio_nao_e_ressalva(self):
        """So o SUFIXO e meta — cortar no meio mutilaria a frase."""
        assert ganchos_da_resposta("o (falso) consenso sobre juros") == [
            "O (falso) consenso sobre juros"
        ]

    def test_gancho_ja_usado_nao_volta_como_novidade(self):
        bruto = "o juro trabalha contra voce\numa frase realmente nova aqui"
        assert ganchos_da_resposta(bruto, ja_usados=["o juro trabalha contra voce"]) == [
            "Uma frase realmente nova aqui"
        ]

    def test_o_ja_usado_e_comparado_sem_ligar_para_caixa(self):
        assert ganchos_da_resposta("Uma Frase Aqui", ja_usados=["uma frase aqui"]) == []

    def test_ressalva_removida_revela_o_ja_usado(self):
        """As duas defesas se completam: o caso real precisou das duas.

        Sem tirar a ressalva, a linha nao casaria com o historico; sem o
        historico, a frase limpa entraria como se fosse nova.
        """
        bruto = "o juro trabalha contra voce (ja usado — evitar)"
        assert ganchos_da_resposta(bruto, ja_usados=["o juro trabalha contra voce"]) == []

    def test_historico_vazio_nao_atrapalha(self):
        assert ganchos_da_resposta("uma frase qualquer aqui", ja_usados=[]) == [
            "Uma frase qualquer aqui"
        ]
