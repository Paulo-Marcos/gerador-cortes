"""D-497: o que a IA propoe de cena, e o que dela sobrevive.

Duas coisas sao testadas aqui, e nenhuma e "o modelo acertou":

  - o RECORTE da transcricao, porque e ele que decide em que relogio o modelo
    pensa. Um erro aqui nao levanta excecao nenhuma: sai uma cena aparecendo no
    instante errado, e o operador procura o bug no renderer;
  - o FILTRO da resposta, porque um LLM devolve, com frequencia, uma cena de
    0,3s, duas no mesmo instante, ou um CTA no comeco. Descartar cada uma com o
    motivo e o que evita a tela ficar em silencio.
"""

import pytest
from app.domain.cenas_short_ia import (
    FRACAO_DO_CTA,
    JANELA_DO_HOOK_SEG,
    normalizar_sugestoes,
    recortar_transcricao,
)

FALA = [
    {"start": 0.0, "fim": 5.0, "texto": "abertura do bruto"},
    {"start": 20.0, "fim": 24.0, "texto": "antes do trecho"},
    {"start": 30.0, "fim": 34.0, "texto": "primeira do trecho"},
    {"start": 40.0, "fim": 44.0, "texto": "segunda do trecho"},
    {"start": 90.0, "fim": 94.0, "texto": "depois do trecho"},
]


class TestRecorte:
    def test_so_entra_o_que_toca_a_janela(self):
        janela = recortar_transcricao(FALA, 30.0, 60.0)

        assert [s["texto"] for s in janela] == ["primeira do trecho", "segunda do trecho"]

    def test_o_relogio_volta_zerado_no_short(self):
        """A cena vive na timeline do SHORT.

        Se o prompt levasse os tempos do bruto, toda cena voltaria deslocada
        pelo inicio do trecho — e o sintoma seria uma cena no instante errado,
        sem nada no codigo apontando para a conversao que faltou.
        """
        janela = recortar_transcricao(FALA, 30.0, 60.0)

        assert [s["start"] for s in janela] == [0.0, 10.0]

    def test_a_fala_que_atravessa_o_corte_entra_com_tempo_negativo(self):
        """Ela e a que ABRE o short, pela metade.

        Deixa-la de fora daria ao modelo um comeco que o espectador nao vai
        ouvir; zerar o tempo dela mentiria sobre onde ela esta.
        """
        janela = recortar_transcricao(FALA, 22.0, 35.0)

        assert janela[0]["start"] == -2.0

    def test_sem_fim_no_segmento_vale_ate_o_proximo(self):
        """E como o resto do projeto le uma transcricao por segmentos."""
        sem_fim = [{"start": 0.0, "texto": "longa"}, {"start": 50.0, "texto": "outra"}]

        janela = recortar_transcricao(sem_fim, 10.0, 20.0)

        assert [s["texto"] for s in janela] == ["longa"]

    def test_janela_invertida_nao_recorta_nada(self):
        assert recortar_transcricao(FALA, 30.0, 30.0) == []

    def test_o_segmento_original_nao_e_mutado(self):
        """A transcricao do corte e compartilhada; rebasear no lugar a corromperia."""
        original = [dict(s) for s in FALA]

        recortar_transcricao(FALA, 30.0, 60.0)

        assert FALA == original


def cena(**over) -> dict:
    return {"tipo": "citacao", "inicio": 5.0, "fim": 8.0, "texto": "uma frase", **over}


class TestNormalizacao:
    def test_o_caminho_feliz_devolve_em_ordem_de_tempo(self):
        resultado = normalizar_sugestoes(
            {
                "cenas": [
                    cena(inicio=10.0, fim=13.0),
                    cena(tipo="hook", inicio=0.0, fim=3.0, texto="olha"),
                ]
            },
            duracao_short=30.0,
        )

        assert [c.inicio for c in resultado.cenas] == [0.0, 10.0]
        assert resultado.descartes == []

    def test_lista_crua_tambem_serve(self):
        """Modelos escorregam no involucro; recusar por isso jogaria fora o conteudo."""
        resultado = normalizar_sugestoes([cena()], duracao_short=30.0)

        assert len(resultado.cenas) == 1

    def test_lista_vazia_e_resposta_valida(self):
        """Um trecho que se sustenta na fala nao precisa de cartao nenhum."""
        resultado = normalizar_sugestoes({"cenas": []}, duracao_short=30.0)

        assert resultado.cenas == []
        assert resultado.descartes == []

    def test_uma_cena_torta_nao_derruba_as_boas(self):
        """`normalizar_lista` levanta na primeira invalida — certo para a tela,
        errado aqui: uma cena ruim entre tres boas custaria as outras tres."""
        resultado = normalizar_sugestoes(
            [cena(), cena(inicio=20.0, fim=20.2), cena(inicio=25.0, fim=28.0)],
            duracao_short=30.0,
        )

        assert len(resultado.cenas) == 2
        assert len(resultado.descartes) == 1

    def test_todo_descarte_diz_o_motivo(self):
        """Sem motivo, a IA "propoe cinco" e a tela mostra tres, em silencio."""
        resultado = normalizar_sugestoes(
            [cena(texto=""), cena(tipo="inexistente"), "nao sou objeto"],
            duracao_short=30.0,
        )

        assert len(resultado.descartes) == 3
        for motivo in resultado.descartes:
            assert motivo.startswith("cena "), motivo
            assert len(motivo) > len("cena 1: ")


class TestSobreposicao:
    def test_a_segunda_cena_no_mesmo_instante_cai(self):
        resultado = normalizar_sugestoes(
            [cena(inicio=5.0, fim=9.0), cena(inicio=6.0, fim=10.0, tipo="numero")],
            duracao_short=30.0,
        )

        assert len(resultado.cenas) == 1
        assert "taparia" in resultado.descartes[0]

    def test_quem_vem_antes_no_tempo_vence(self):
        resultado = normalizar_sugestoes(
            [cena(inicio=6.0, fim=10.0, texto="depois"), cena(inicio=5.0, fim=9.0, texto="antes")],
            duracao_short=30.0,
        )

        assert [c.texto for c in resultado.cenas] == ["antes"]

    def test_cenas_encostadas_convivem(self):
        """Fim de uma no inicio da outra nao e sobreposicao."""
        resultado = normalizar_sugestoes(
            [cena(inicio=5.0, fim=8.0), cena(inicio=8.0, fim=11.0, tipo="numero")],
            duracao_short=30.0,
        )

        assert len(resultado.cenas) == 2


class TestTiposPosicionais:
    def test_o_gancho_no_meio_do_short_nao_e_gancho(self):
        """O tipo promete "o que segura os 3 primeiros segundos"."""
        tarde = JANELA_DO_HOOK_SEG + 1
        resultado = normalizar_sugestoes(
            [cena(tipo="hook", inicio=tarde, fim=tarde + 3)], duracao_short=30.0
        )

        assert resultado.cenas == []
        assert "gancho" in resultado.descartes[0]

    def test_o_cta_no_comeco_convida_a_sair(self):
        resultado = normalizar_sugestoes(
            [cena(tipo="cta", inicio=1.0, fim=4.0)], duracao_short=30.0
        )

        assert resultado.cenas == []
        assert "CTA" in resultado.descartes[0]

    def test_o_cta_na_segunda_metade_passa(self):
        inicio = 30.0 * FRACAO_DO_CTA + 1
        resultado = normalizar_sugestoes(
            [cena(tipo="cta", inicio=inicio, fim=inicio + 3)], duracao_short=30.0
        )

        assert len(resultado.cenas) == 1

    @pytest.mark.parametrize("tipo", ["hook", "cta"])
    def test_so_ha_uma_abertura_e_um_fecho(self, tipo):
        cedo, tarde = (0.0, 2.0) if tipo == "hook" else (20.0, 25.0)
        resultado = normalizar_sugestoes(
            [
                cena(tipo=tipo, inicio=cedo, fim=cedo + 1.5),
                cena(tipo=tipo, inicio=tarde, fim=tarde + 1.5),
            ],
            duracao_short=30.0,
        )

        assert len(resultado.cenas) == 1
        assert "já tem uma" in resultado.descartes[0]

    def test_dois_numeros_convivem(self):
        """Repetir tipo so e problema nos posicionais — dois dados sao dois dados."""
        resultado = normalizar_sugestoes(
            [
                cena(tipo="numero", inicio=5.0, fim=8.0),
                cena(tipo="numero", inicio=15.0, fim=18.0),
            ],
            duracao_short=30.0,
        )

        assert len(resultado.cenas) == 2
