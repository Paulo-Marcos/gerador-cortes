"""D-565 (onda 3): o texto de publicacao de um short.

Dois alvos. O primeiro e a RESILIENCIA do parser: este JSON e escrito por um
modelo, e perder a geracao inteira porque ele embrulhou em ```json custaria uma
chamada paga e uma espera de dois minutos.

O segundo sao as hashtags. Elas parecem detalhe e nao sao: uma frase com `#` na
frente vira uma hashtag que ninguem busca, e o `#` guardado aqui produziria
`##juros` depois que `publicacao._normalizar_hashtags` acrescentar o seu.
"""

import pytest
from app.domain.metadados_short import (
    MAX_HASHTAGS,
    MAX_TITULO,
    PostDoShort,
    normalizar_hashtag,
    normalizar_hashtags,
    post_da_resposta,
)


class TestPostDoShort:
    def test_sem_titulo_o_post_esta_vazio(self):
        """Descricao e hashtags nao sustentam um post sozinhas."""
        assert PostDoShort(descricao="tem texto", hashtags=["juros"]).vazio

    def test_com_titulo_o_post_existe(self):
        assert not PostDoShort(titulo="Um titulo").vazio

    def test_titulo_so_de_espaco_conta_como_vazio(self):
        assert PostDoShort(titulo="   ").vazio


class TestNormalizarHashtag:
    def test_tira_o_cerquilha_que_o_modelo_poe(self):
        """Guardar o `#` produziria `##juros` depois do normalizador da publicacao."""
        assert normalizar_hashtag("#JuroComposto") == "JuroComposto"

    def test_frase_vira_termo(self):
        assert normalizar_hashtag("  taxa de juros  ") == "taxadejuros"

    def test_preserva_acento_do_portugues(self):
        assert normalizar_hashtag("#inflação") == "inflação"

    def test_preserva_numero(self):
        assert normalizar_hashtag("#selic15") == "selic15"

    @pytest.mark.parametrize("lixo", ["###", "   ", "", "-–—"])
    def test_o_que_nao_sobra_termo_vira_vazio(self, lixo):
        assert normalizar_hashtag(lixo) == ""


class TestNormalizarHashtags:
    def test_repetida_entra_uma_vez_so(self):
        assert normalizar_hashtags(["#juros", "juros", "JUROS"]) == ["juros"]

    def test_aceita_string_separada_por_espaco(self):
        """O modelo escorrega entre lista e string; recusar perderia a geracao."""
        assert normalizar_hashtags("#juros #selic") == ["juros", "selic"]

    def test_aceita_string_separada_por_virgula(self):
        assert normalizar_hashtags("juros, selic") == ["juros", "selic"]

    def test_para_no_teto(self):
        muitas = [f"tag{i}" for i in range(30)]
        assert len(normalizar_hashtags(muitas)) == MAX_HASHTAGS

    @pytest.mark.parametrize("nada", [None, 42, {}, []])
    def test_valor_que_nao_e_lista_nem_texto_vira_lista_vazia(self, nada):
        assert normalizar_hashtags(nada) == []


class TestPostDaResposta:
    def test_json_limpo_e_o_caso_feliz(self):
        post = post_da_resposta(
            '{"titulo": "O erro dos juros", "descricao": "contexto", "hashtags": ["#juros"]}'
        )
        assert post.titulo == "O erro dos juros"
        assert post.descricao == "contexto"
        assert post.hashtags == ["juros"]

    def test_aceita_o_dict_ja_desserializado(self):
        assert post_da_resposta({"titulo": "Direto"}).titulo == "Direto"

    def test_cerca_de_markdown_nao_atrapalha(self):
        assert post_da_resposta('```json\n{"titulo": "Com cerca"}\n```').titulo == "Com cerca"

    def test_linha_de_conversa_antes_do_json_nao_atrapalha(self):
        bruto = 'Aqui estao os metadados:\n{"titulo": "Sobrevivi"}\nEspero que ajude!'
        assert post_da_resposta(bruto).titulo == "Sobrevivi"

    @pytest.mark.parametrize("nada", ["", "   ", "nao e json nenhum", "{quebrado", None])
    def test_resposta_inaproveitavel_devolve_post_vazio(self, nada):
        """Vazio faz a publicacao cair no comportamento de antes.

        Melhor que gravar um titulo inventado por cima do que o operador tinha.
        """
        assert post_da_resposta(nada).vazio

    def test_campo_que_nao_e_texto_e_ignorado(self):
        post = post_da_resposta({"titulo": 42, "descricao": ["lista"]})
        assert post.titulo == ""
        assert post.descricao == ""

    def test_titulo_gigante_para_no_teto_de_seguranca(self):
        post = post_da_resposta({"titulo": "x" * 5000})
        assert len(post.titulo) == MAX_TITULO
