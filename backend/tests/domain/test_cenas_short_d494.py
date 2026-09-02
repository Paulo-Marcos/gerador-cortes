"""D-494: o que e uma cena valida de short.

As quatro cenas verticais existiam no renderer desde a D-465 e o render as
desenhava — mas `cenas_remotion` nascia "[]" e ficava assim, porque nao havia
como cria-las. Este dominio e o portao.

A postura destes testes: erro EXPLICITO em vez de correcao silenciosa. Uma cena
que o sistema conserta sozinho sai no arquivo diferente do que o operador
escreveu, e ele so descobre depois do render.
"""

import pytest
from app.domain.cenas_short import (
    DURACAO_MINIMA_SEG,
    CenaInvalida,
    CenaShort,
    TipoCenaShort,
    normalizar,
    normalizar_lista,
    sugerir_janela,
)

DURACAO = 30.0


def cena(**over) -> dict:
    return {"tipo": "hook", "inicio": 0.0, "fim": 3.0, "texto": "Olha isso", **over}


class TestNormalizar:
    def test_cena_boa_vira_objeto(self):
        c = normalizar(cena(), DURACAO)

        assert (c.tipo, c.inicio, c.fim, c.texto) == (TipoCenaShort.HOOK, 0.0, 3.0, "Olha isso")

    def test_os_quatro_tipos_sao_aceitos(self):
        for tipo in ("hook", "numero", "citacao", "cta"):
            assert normalizar(cena(tipo=tipo), DURACAO).tipo.value == tipo

    def test_tipo_inventado_diz_quais_existem(self):
        """A mensagem precisa dizer o que fazer, nao so que deu errado."""
        with pytest.raises(CenaInvalida, match="hook"):
            normalizar(cena(tipo="grafico"), DURACAO)

    def test_cena_sem_texto_e_recusada(self):
        for vazio in ("", "   ", None):
            with pytest.raises(CenaInvalida, match="texto"):
                normalizar(cena(texto=vazio), DURACAO)

    def test_texto_longo_demais_para_um_short(self):
        with pytest.raises(CenaInvalida, match="limite"):
            normalizar(cena(texto="x" * 500), DURACAO)

    def test_cena_curta_demais_para_ler(self):
        with pytest.raises(CenaInvalida, match="ler"):
            normalizar(cena(inicio=0, fim=DURACAO_MINIMA_SEG / 2), DURACAO)

    def test_cena_que_passa_do_fim_do_short(self):
        """O short e um arquivo proprio: cena alem do fim nao aparece."""
        with pytest.raises(CenaInvalida, match="short tem"):
            normalizar(cena(inicio=25, fim=40), DURACAO)

    def test_tempo_negativo_e_recusado(self):
        with pytest.raises(CenaInvalida, match="negativo"):
            normalizar(cena(inicio=-1, fim=3), DURACAO)

    def test_tempo_que_nao_e_numero(self):
        with pytest.raises(CenaInvalida, match="mero de segundos"):
            normalizar(cena(inicio="logo ali"), DURACAO)


class TestParaJson:
    def test_apoio_vazio_nao_vai_para_o_renderer(self):
        """String vazia faria a cena desenhar uma linha de apoio em branco."""
        assert "apoio" not in normalizar(cena(), DURACAO).para_json()

    def test_apoio_preenchido_vai(self):
        assert normalizar(cena(apoio="R$ bilhões"), DURACAO).para_json()["apoio"] == "R$ bilhões"


class TestLista:
    def test_ordena_pelo_inicio(self):
        cenas = normalizar_lista(
            [cena(inicio=10, fim=13), cena(inicio=0, fim=3, tipo="cta")], DURACAO
        )

        assert [c.inicio for c in cenas] == [0.0, 10.0]

    def test_sobreposicao_e_recusada_e_diz_onde(self):
        """Duas cenas no mesmo instante se tapam — o operador veria so uma."""
        with pytest.raises(CenaInvalida, match="sobrep"):
            normalizar_lista([cena(inicio=0, fim=5), cena(inicio=4, fim=8)], DURACAO)

    def test_cenas_encostadas_sao_validas(self):
        # Fim de uma no inicio da outra nao e sobreposicao — e sequencia.
        cenas = normalizar_lista([cena(inicio=0, fim=5), cena(inicio=5, fim=8)], DURACAO)

        assert len(cenas) == 2

    def test_usa_o_mesmo_validador_do_horizontal(self):
        """Sobreposicao e a mesma pergunta nos dois formatos."""
        import inspect

        from app.domain import cenas_short

        assert "verificar_sobreposicao" in inspect.getsource(cenas_short.normalizar_lista)

    def test_lista_vazia_e_valida(self):
        assert normalizar_lista([], DURACAO) == []


class TestSugerirJanela:
    def test_sem_cenas_comeca_no_zero(self):
        assert sugerir_janela([], DURACAO)[0] == 0.0

    def test_acha_o_vao_entre_duas_cenas(self):
        """Nascer sobre uma cena existente obrigaria a arrumar antes de escrever."""
        existentes = normalizar_lista([cena(inicio=0, fim=4), cena(inicio=10, fim=14)], DURACAO)

        inicio, fim = sugerir_janela(existentes, DURACAO)

        assert inicio >= 4.0 and fim <= 10.0

    def test_sem_vao_encosta_no_fim(self):
        cheio = [CenaShort(TipoCenaShort.HOOK, 0.0, DURACAO, "tudo")]

        inicio, fim = sugerir_janela(cheio, DURACAO)

        assert fim <= DURACAO
        assert inicio < fim

    def test_a_janela_sugerida_sempre_passa_na_validacao(self):
        """De nada adianta sugerir uma janela que o proprio dominio recusa."""
        for existentes in ([], normalizar_lista([cena(inicio=0, fim=4)], DURACAO)):
            inicio, fim = sugerir_janela(existentes, DURACAO)

            normalizar({"tipo": "hook", "inicio": inicio, "fim": fim, "texto": "x"}, DURACAO)
