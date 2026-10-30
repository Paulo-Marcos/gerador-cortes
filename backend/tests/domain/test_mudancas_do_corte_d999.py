"""D-999: "o que você mudou" sai do diff proposta × final, sem voto."""

from app.domain.corte.mudancas_do_corte import (
    TIPOS_MUDANCA,
    mudancas_do_corte,
    mudancas_por_origem,
)
from app.domain.corte.telemetria_cortes import (
    COLUNAS_CSV_TELEMETRIA,
    diff_proposta_vs_final,
    telemetria_csv,
)


def _snapshot(**sobre) -> dict:
    base = {
        "titulo_proposto": "Proposto",
        "inicio_seg": 100.0,
        "fim_seg": 700.0,
        "desvios": [{"inicio_seg": 200.0, "fim_seg": 230.0, "origem": "claude"}],
        "origem_analise": "claude",
    }
    return {**base, **sobre}


def _corte(**sobre) -> dict:
    base = {
        "id": "c-1",
        "numero": 1,
        "titulo_proposto": "Proposto",
        "titulo_youtube": "",
        "inicio_seg": 100.0,
        "fim_seg": 700.0,
        "status": "aprovado",
        "desvios": [{"inicio_seg": 200.0, "fim_seg": 230.0, "origem": "claude"}],
    }
    return {**base, **sobre}


def _tipos(diff: dict) -> list[str]:
    return [m["tipo"] for m in diff["mudancas"]]


def test_corte_igual_a_proposta_nao_tem_mudanca():
    assert diff_proposta_vs_final(_snapshot(), _corte())["mudancas"] == []


def test_comecar_antes_estica_e_terminar_antes_encurta():
    diff = diff_proposta_vs_final(_snapshot(), _corte(inicio_seg=88.0, fim_seg=640.0))

    assert diff["mudancas"][:2] == [
        {"tipo": "inicio_esticado", "valor": 12.0, "descricao": "Começo esticado em 12 s"},
        {"tipo": "fim_encurtado", "valor": 60.0, "descricao": "Fim encurtado em 1 min 00 s"},
    ]


def test_comecar_depois_encurta_e_terminar_depois_estica():
    diff = diff_proposta_vs_final(_snapshot(), _corte(inicio_seg=130.0, fim_seg=705.0))

    assert _tipos(diff) == ["inicio_encurtado", "fim_esticado"]


def test_borda_mexida_menos_de_um_segundo_e_ajuste_fino():
    diff = diff_proposta_vs_final(_snapshot(), _corte(inicio_seg=100.6, fim_seg=699.2))

    assert diff["mudancas"] == []


def test_titulo_trocado_e_trechos_acrescentados_e_desfeitos():
    diff = diff_proposta_vs_final(
        _snapshot(),
        _corte(
            titulo_youtube="Outro título",
            desvios=[
                {"inicio_seg": 300.0, "fim_seg": 310.0, "origem": "manual"},
                {"inicio_seg": 400.0, "fim_seg": 420.0},
            ],
        ),
    )

    assert diff["mudancas"] == [
        {"tipo": "titulo_trocado", "valor": 1, "descricao": "Título trocado"},
        {"tipo": "trechos_acrescentados", "valor": 2, "descricao": "2 trechos acrescentados"},
        {"tipo": "trechos_desfeitos", "valor": 1, "descricao": "1 trecho desfeito"},
    ]


def test_corte_sem_proposta_da_ia_nao_tem_contra_o_que_comparar():
    diff = diff_proposta_vs_final(None, _corte(inicio_seg=10.0), projeto_tem_snapshots=True)

    assert diff["mudancas"] == []


def test_o_diff_nao_traz_mais_o_voto():
    diff = diff_proposta_vs_final(_snapshot(), _corte(voto_qualidade=5))

    assert "avaliacao" not in diff
    assert not any(coluna.startswith("voto") for coluna in COLUNAS_CSV_TELEMETRIA)


def test_csv_leva_os_tipos_de_mudanca_numa_coluna():
    diff = diff_proposta_vs_final(_snapshot(), _corte(inicio_seg=90.0, titulo_youtube="Novo"))
    diff["projeto_id"] = "p"
    diff["projeto_titulo"] = "L"

    linha = telemetria_csv([diff]).strip().split("\n")[1]
    colunas = dict(zip(COLUNAS_CSV_TELEMETRIA, linha.split(","), strict=True))

    assert colunas["mudancas"] == "inicio_esticado|titulo_trocado"


def test_soma_por_origem_conta_cortes_por_tipo_e_os_apagados():
    claude_mexido = diff_proposta_vs_final(_snapshot(), _corte(inicio_seg=90.0))
    claude_intacto = diff_proposta_vs_final(_snapshot(), _corte(id="c-2"))
    gemini = diff_proposta_vs_final(
        _snapshot(origem_analise="gemini"), _corte(id="c-3", titulo_youtube="Novo")
    )
    manual = diff_proposta_vs_final(None, _corte(id="c-4"), projeto_tem_snapshots=True)

    resumo = mudancas_por_origem(
        [claude_mexido, claude_intacto, gemini, manual],
        [("claude", "repetido"), ("claude", ""), ("", "tema_fraco")],
    )

    por_origem = {grupo["origem"]: grupo for grupo in resumo}
    assert list(por_origem) == ["claude", "desconhecida", "gemini"]
    claude = por_origem["claude"]
    assert (claude["cortes"], claude["sem_mudanca"]) == (2, 1)
    assert claude["por_tipo"]["inicio_esticado"] == 1
    assert set(claude["por_tipo"]) == set(TIPOS_MUDANCA)
    assert claude["apagados"]["total"] == 2
    assert claude["apagados"]["por_motivo"]["repetido"] == 1
    assert claude["apagados"]["por_motivo"]["sem_motivo"] == 1
    assert por_origem["gemini"]["por_tipo"]["titulo_trocado"] == 1
    assert por_origem["gemini"]["apagados"]["total"] == 0
    assert por_origem["desconhecida"]["cortes"] == 0
    assert por_origem["desconhecida"]["apagados"]["por_motivo"]["tema_fraco"] == 1


def test_mudancas_de_um_diff_sem_snapshot_vazias_mesmo_chamando_direto():
    assert mudancas_do_corte({"situacao": "sem_snapshot"}) == []
