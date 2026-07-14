"""Validação pré-publicação no YouTube (D-363).

Cobre as checagens puras e a agregação do relatório. Política: qualquer item
faltando bloqueia (todas as checagens são bloqueantes).
"""

from app.services.validacao_publicacao import (
    RelatorioValidacao,
    _checar_cenas,
    _checar_descricao,
    _checar_duracao,
    _checar_tags,
    _checar_titulo,
)


def test_duracao_dentro_da_tolerancia_passa():
    assert _checar_duracao(300.0, 301.0).ok is True


def test_duracao_divergente_bloqueia_pega_d362():
    """Vídeo final 8 min quando a líquida é 5 min → trechos não aplicados."""
    c = _checar_duracao(480.0, 300.0)
    assert c.ok is False
    assert "480" in c.detalhe and "300" in c.detalhe


def test_duracao_sem_probe_bloqueia():
    assert _checar_duracao(None, 300.0).ok is False


def test_titulo_vazio_bloqueia():
    assert _checar_titulo("").ok is False
    assert _checar_titulo("   ").ok is False
    assert _checar_titulo("Meu título").ok is True


def test_descricao_vazia_bloqueia():
    assert _checar_descricao(None).ok is False
    assert _checar_descricao("Resumo do corte").ok is True


def test_tags_aceita_json_string_e_lista():
    assert _checar_tags("[]").ok is False
    assert _checar_tags('["a", "b"]').ok is True
    assert _checar_tags(["x"]).ok is True
    assert _checar_tags('["   "]').ok is False  # só espaços não conta


def test_cenas_vazias_bloqueiam():
    assert _checar_cenas("[]").ok is False
    assert _checar_cenas([{"id": 1}]).ok is True


def test_relatorio_bloqueado_quando_qualquer_check_falha():
    rel = RelatorioValidacao(
        [_checar_titulo("ok"), _checar_tags("[]")]  # tags falha
    )
    assert rel.bloqueado is True
    assert rel.ok is False
    assert "Tags" in rel.to_dict()["pendencias"]


def test_relatorio_ok_quando_tudo_passa():
    rel = RelatorioValidacao(
        [
            _checar_titulo("t"),
            _checar_descricao("d"),
            _checar_tags(["a"]),
            _checar_cenas([{"x": 1}]),
        ]
    )
    assert rel.ok is True
    assert rel.to_dict()["pendencias"] == []
