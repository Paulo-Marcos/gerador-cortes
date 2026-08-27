"""Validação pré-publicação no YouTube (D-363 + D-369).

Cobre as checagens puras e a agregação do relatório. Regras de severidade:
- Bloqueiam: vídeo final, título, descrição, tags, thumbnail, cenas apontando
  para fora do corte e vídeo final MENOR que o corte (falta vídeo no fim).
- Avisos (não bloqueiam): existência de cenas (opcionais), duração não-medível
  (D-369) e duração acima do esperado (é a abertura/encerramento).
"""

from app.services.validacao_publicacao import (
    RelatorioValidacao,
    _checar_cenas,
    _checar_cenas_no_intervalo,
    _checar_descricao,
    _checar_duracao,
    _checar_tags,
    _checar_titulo,
)


def test_duracao_acima_do_esperado_e_aviso_d369():
    """O vídeo de upload tem intro/outro, então é MAIOR que a líquida: só informa."""
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


# --- falta vídeo no fim: as duas checagens novas ---


def test_duracao_menor_que_o_corte_bloqueia():
    """O upload soma abertura/encerramento — um final MENOR que a líquida é truncamento."""
    c = _checar_duracao(300.0, 980.0)
    assert c.ok is False
    assert c.bloqueante is True
    assert "MENOR" in c.detalhe


def test_duracao_dentro_da_folga_de_arredondamento_nao_bloqueia():
    # 2% absorve keyframe/concat; truncamento real corta minutos, não centésimos.
    assert _checar_duracao(979.0, 980.0).ok is True


def test_cenas_no_intervalo_aceita_payload_dict():
    # 100% dos cortes no banco gravam dict {formato, paleta, cenas} — a checagem
    # antiga usava _parse_lista_json e enxergava zero cena em todos eles.
    payload = {"formato": "vlog_analitico", "cenas": [{"inicio": 2.0, "fim": 8.0}]}
    assert _checar_cenas_no_intervalo(payload, 980.3).ok is True
    assert _checar_cenas(payload).ok is True


def test_cenas_no_intervalo_bloqueia_tempo_absoluto_da_live():
    payload = {"cenas": [{"inicio": 2.24, "fim": 6.24}, {"inicio": 1370.88, "fim": 1375.88}]}
    c = _checar_cenas_no_intervalo(payload, 980.3)
    assert c.ok is False
    assert c.bloqueante is True
    assert "1 de 2" in c.detalhe


def test_cenas_no_intervalo_aceita_json_string():
    import json as _json

    bruto = _json.dumps({"cenas": [{"inicio": 1370.88, "fim": 1375.88}]})
    assert _checar_cenas_no_intervalo(bruto, 980.3).ok is False


def test_cenas_no_intervalo_sem_cenas_e_aviso_nao_bloqueia():
    c = _checar_cenas_no_intervalo("[]", 980.3)
    assert c.ok is True
    assert c.bloqueante is False


def test_cenas_no_intervalo_sem_duracao_nao_bloqueia():
    """Sem referência de duração não dá para julgar — não trava o upload."""
    payload = {"cenas": [{"inicio": 1370.88, "fim": 1375.88}]}
    c = _checar_cenas_no_intervalo(payload, 0.0)
    assert c.ok is True
    assert c.bloqueante is False


def test_relatorio_bloqueia_com_cena_fora_do_corte():
    rel = RelatorioValidacao(
        [
            _checar_titulo("t"),
            _checar_cenas_no_intervalo({"cenas": [{"inicio": 1370.88, "fim": 1375.88}]}, 980.3),
        ]
    )
    assert rel.bloqueado is True
    assert "Cenas dentro do corte" in rel.to_dict()["pendencias"]
