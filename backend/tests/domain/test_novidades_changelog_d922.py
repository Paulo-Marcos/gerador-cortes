"""D-922: o CHANGELOG e os fragmentos viram entradas, e a resposta da IA é conferida."""

from __future__ import annotations

from app.domain.novidades.changelog import (
    SEM_VERSAO,
    chave_do_texto,
    juntar,
    ler_changelog,
    ler_fragmentos,
)
from app.domain.novidades.traducao import ler_resposta, montar_pedido

CHANGELOG = """# Changelog

Intro que não é entrada.

## [Unreleased]

### Added
- **Spread a batch of shorts.** The batch modal gains a third
  "when" (D-908).

## [0.6.0] - 2026-10-07

### Added
- **Covers can star the host.** Canais gains "Estilo das capas" (D-909).
- Plain entry without bold.

### Fixed
- **A fix.** Something
  that wraps
  - with a sub-item (D-901, D-901).
"""


class TestLerChangelog:
    def test_versoes_na_ordem_do_arquivo_com_data(self):
        versoes = ler_changelog(CHANGELOG)

        assert [(v.versao, v.data) for v in versoes] == [
            (SEM_VERSAO, None),
            ("0.6.0", "2026-10-07"),
        ]

    def test_entrada_tem_categoria_titulo_texto_e_demandas(self):
        entradas = ler_changelog(CHANGELOG)[1].entradas

        assert [e.categoria for e in entradas] == ["added", "added", "fixed"]
        assert entradas[0].titulo == "Covers can star the host."
        assert entradas[1].titulo == "Plain entry without bold."
        assert entradas[2].texto.endswith("- with a sub-item (D-901, D-901).")
        assert entradas[2].demandas == ("D-901",)

    def test_chave_ignora_a_quebra_de_linha(self):
        assert chave_do_texto("a b\nc") == chave_do_texto("a  b c")
        assert chave_do_texto("a b") != chave_do_texto("a c")


class TestFragmentos:
    def test_nome_fora_do_padrao_fica_de_fora_e_o_mais_novo_vem_primeiro(self):
        entradas = ler_fragmentos(
            {
                "D-911.added.md": "- **Older.** x (D-911).\n",
                "D-919.fixed.md": "- **Newer.** y\n  wraps (D-919).\n",
                "LEIAME.md": "- não é fragmento\n",
            }
        )

        assert [(e.titulo, e.categoria) for e in entradas] == [
            ("Newer.", "fixed"),
            ("Older.", "added"),
        ]

    def test_fragmento_entra_no_topo_da_secao_sem_versao_sem_duplicar(self):
        versoes = ler_changelog(CHANGELOG)
        ja_compilada = "- **Spread a batch of shorts.** The batch modal gains a third\n"
        ja_compilada += '"when" (D-908).\n'
        fragmentos = ler_fragmentos(
            {"D-919.fixed.md": "- **New fix.** z (D-919).\n", "D-908.added.md": ja_compilada}
        )

        juntas = juntar(versoes, fragmentos)

        assert [e.titulo for e in juntas[0].entradas] == [
            "New fix.",
            "Spread a batch of shorts.",
        ]
        assert juntas[1] == versoes[1]

    def test_sem_secao_sem_versao_ela_nasce_dos_fragmentos(self):
        so_release = ler_changelog("## [0.1.0] - 2026-07-04\n### Added\n- **A.** a\n")

        juntas = juntar(so_release, ler_fragmentos({"D-1000.added.md": "- **B.** b\n"}))

        assert [v.versao for v in juntas] == [SEM_VERSAO, "0.1.0"]


class TestTraducao:
    def test_pedido_leva_chave_e_texto_de_cada_entrada(self):
        entrada = ler_changelog(CHANGELOG)[1].entradas[0]

        pedido = montar_pedido([entrada])

        assert entrada.chave in pedido
        assert "Estilo das capas" in pedido
        assert '"traducoes"' in pedido

    def test_resposta_so_aceita_chave_pedida_com_titulo_e_resumo(self):
        resposta = {
            "traducoes": [
                {"chave": "a", "titulo": " Título ", "resumo": "Resumo.", "como_usar": ""},
                {"chave": "b", "titulo": "", "resumo": "Sem título."},
                {"chave": "intrusa", "titulo": "T", "resumo": "R", "como_usar": ""},
                {"chave": "c", "titulo": "T", "resumo": "R", "como_usar": 3},
                "lixo",
            ]
        }

        assert ler_resposta(resposta, {"a", "b", "c"}) == {
            "a": {"titulo": "Título", "resumo": "Resumo.", "como_usar": ""}
        }

    def test_resposta_sem_lista_nao_traduz_nada(self):
        assert ler_resposta({"traducoes": "x"}, {"a"}) == {}
