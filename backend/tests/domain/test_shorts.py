"""D-454: as regras que protegem o recorte contra o palpite solto do modelo.

Cada teste aqui existe porque a falha correspondente produziria um short quebrado
no disco — arquivo cortado fora do bruto, trecho de 4 segundos, dois vídeos com a
mesma fala — e não uma exceção que alguém veria.
"""

from __future__ import annotations

from app.domain.short.shorts import FaixaShort, normalizar_sugestoes

_FAIXA = FaixaShort(duracao_min_seg=15.0, duracao_max_seg=90.0, quantidade_min=5, quantidade_max=8)


def _resposta(*itens: dict) -> dict:
    return {"shorts": list(itens)}


def _item(titulo: str, inicio: str, fim: str, score: float = 8.0) -> dict:
    return {
        "titulo": titulo,
        "gancho": f"gancho de {titulo}",
        "inicio": inicio,
        "fim": fim,
        "score": score,
        "justificativa": "trecho fecha sozinho",
    }


def test_candidatos_saem_ordenados_pela_nota():
    resultado = normalizar_sugestoes(
        _resposta(
            _item("fraco", "00:00", "00:30", score=5),
            _item("forte", "01:00", "01:30", score=9),
            _item("medio", "02:00", "02:30", score=7),
        ),
        duracao_bruto_seg=600.0,
        faixa=_FAIXA,
    )

    assert [s.titulo for s in resultado.sugestoes] == ["forte", "medio", "fraco"]
    assert resultado.descartes == []


def test_trecho_que_termina_depois_do_bruto_e_descartado():
    """O recorte usaria um arquivo que ja acabou — falha silenciosa no ffmpeg."""
    resultado = normalizar_sugestoes(
        _resposta(_item("fantasma", "09:00", "09:40")),
        duracao_bruto_seg=300.0,
        faixa=_FAIXA,
    )

    assert resultado.sugestoes == []
    assert "termina depois do fim do bruto" in resultado.descartes[0]


def test_estouro_por_arredondamento_e_aparado_em_vez_de_descartado():
    """Meio segundo a mais e erro de casa decimal, nao leitura errada."""
    resultado = normalizar_sugestoes(
        _resposta(_item("no limite", "04:30", "05:00.5")),
        duracao_bruto_seg=300.0,
        faixa=_FAIXA,
    )

    assert [s.fim_seg for s in resultado.sugestoes] == [300.0]


def test_duracao_fora_da_faixa_cai_dos_dois_lados():
    resultado = normalizar_sugestoes(
        _resposta(
            _item("curto demais", "00:00", "00:08"),
            _item("longo demais", "01:00", "03:00"),
            _item("no ponto", "05:00", "05:40"),
        ),
        duracao_bruto_seg=600.0,
        faixa=_FAIXA,
    )

    assert [s.titulo for s in resultado.sugestoes] == ["no ponto"]
    assert len(resultado.descartes) == 2
    assert any("minimo" in d or "mínimo" in d for d in resultado.descartes)
    assert any("maximo" in d or "máximo" in d for d in resultado.descartes)


def test_sobreposicao_mantem_so_o_de_maior_nota():
    """Dois shorts sobre a mesma fala sao um short so — e o publico ve repeticao."""
    resultado = normalizar_sugestoes(
        _resposta(
            _item("pior", "01:00", "01:40", score=6),
            _item("melhor", "01:20", "02:00", score=9),
        ),
        duracao_bruto_seg=600.0,
        faixa=_FAIXA,
    )

    assert [s.titulo for s in resultado.sugestoes] == ["melhor"]
    assert "pior: sobrepõe um candidato de nota maior" in resultado.descartes


def test_encostar_sem_invadir_nao_e_sobreposicao():
    resultado = normalizar_sugestoes(
        _resposta(
            _item("primeiro", "01:00", "01:30"),
            _item("segundo", "01:30", "02:00"),
        ),
        duracao_bruto_seg=600.0,
        faixa=_FAIXA,
    )

    assert len(resultado.sugestoes) == 2


def test_teto_de_quantidade_corta_os_piores_e_registra():
    itens = [_item(f"c{i}", f"{i * 2:02d}:00", f"{i * 2:02d}:30", score=i) for i in range(1, 11)]
    resultado = normalizar_sugestoes(_resposta(*itens), duracao_bruto_seg=3600.0, faixa=_FAIXA)

    assert len(resultado.sugestoes) == 8
    assert [s.titulo for s in resultado.sugestoes[:2]] == ["c10", "c9"]
    assert sum("além do teto" in d for d in resultado.descartes) == 2


def test_lista_crua_sem_a_chave_shorts_tambem_e_aceita():
    """Modelo escorrega entre as duas formas; recusar perderia a geracao inteira."""
    resultado = normalizar_sugestoes(
        [_item("solto", "00:10", "00:50")], duracao_bruto_seg=600.0, faixa=_FAIXA
    )

    assert [s.titulo for s in resultado.sugestoes] == ["solto"]


def test_resposta_imprestavel_devolve_vazio_sem_explodir():
    assert normalizar_sugestoes(None, duracao_bruto_seg=600.0).sugestoes == []
    assert normalizar_sugestoes({"shorts": "nada"}, duracao_bruto_seg=600.0).sugestoes == []
    assert normalizar_sugestoes({}, duracao_bruto_seg=600.0).sugestoes == []
