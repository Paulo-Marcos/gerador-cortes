"""Validação pré-publicação no YouTube (D-363 + D-369).

Cobre as checagens puras e a agregação do relatório. Regras de severidade:
- Bloqueiam: vídeo final, título, descrição, tags, thumbnail e duração com
  divergência REAL medida.
- Avisos (não bloqueiam): cenas (opcionais) e duração não-medível (D-369).
"""

from app.services.validacao_publicacao import (
    RelatorioValidacao,
    _checar_cenas,
    _checar_descricao,
    _checar_duracao,
    _checar_tags,
    _checar_titulo,
)


def test_duracao_e_sempre_aviso_nunca_bloqueia_d369():
    """O vídeo de upload tem intro/outro; comparar com a líquida bloquearia à toa."""
    c = _checar_duracao(480.0, 300.0)
    assert c.ok is True
    assert c.bloqueante is False
    assert "480" in c.detalhe  # mostra a duração medida


def test_duracao_nao_medivel_nao_bloqueia_d369():
    """Sem ffprobe não dá para afirmar que está errada — não bloqueia (D-369)."""
    c = _checar_duracao(None, 300.0)
    assert c.ok is True  # não trava o upload
    assert c.bloqueante is False
    assert "não verificada" in c.detalhe


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


def test_cenas_sao_aviso_nao_bloqueiam_d369():
    """Cenas são opcionais: aparecem no relatório mas não travam (D-369)."""
    vazio = _checar_cenas("[]")
    assert vazio.ok is False
    assert vazio.bloqueante is False
    assert _checar_cenas([{"id": 1}]).ok is True


def test_relatorio_bloqueado_so_por_checagem_bloqueante():
    rel = RelatorioValidacao([_checar_titulo("ok"), _checar_tags("[]")])  # tags bloqueia
    assert rel.bloqueado is True
    d = rel.to_dict()
    assert "Tags" in d["pendencias"]


def test_relatorio_nao_bloqueia_quando_so_avisos_falham_d369():
    """Corte 'ok' sem cenas e com duração não-medível não pode ser bloqueado."""
    rel = RelatorioValidacao(
        [
            _checar_titulo("t"),
            _checar_descricao("d"),
            _checar_tags(["a"]),
            _checar_cenas("[]"),  # aviso
            _checar_duracao(None, 300.0),  # não-medível → ok
        ]
    )
    assert rel.bloqueado is False
    assert rel.ok is True
    d = rel.to_dict()
    assert d["pendencias"] == []
    assert "Cenas adicionadas" in d["avisos"]


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
