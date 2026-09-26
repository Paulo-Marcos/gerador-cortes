"""D-303: diff puro proposta-da-IA × corte final (telemetria editorial).

Cobre os casos canônicos da régua: borda movida, desvio rejeitado, desvio
adicionado (por origem), título alterado, corte manual (`sem_proposta_ia`),
corte legado (`sem_snapshot`) e o CSV cross-projeto.
"""

from __future__ import annotations

from app.domain.corte.telemetria_cortes import (
    COLUNAS_CSV_TELEMETRIA,
    SITUACAO_COM_SNAPSHOT,
    SITUACAO_SEM_PROPOSTA_IA,
    SITUACAO_SEM_SNAPSHOT,
    TOLERANCIA_BORDA_DESVIO_SEG,
    diff_proposta_vs_final,
    telemetria_csv,
)


def _snapshot(**kwargs) -> dict:
    base = {
        "titulo_proposto": "Título proposto pela IA",
        "tema_central": "tema",
        "resumo": "resumo",
        "justificativa": "arco fechado",
        "numero": 1,
        "inicio_hms": "00:01:40",
        "fim_hms": "00:11:40",
        "inicio_seg": 100.0,
        "fim_seg": 700.0,
        "desvios": [],
        "origem_analise": "claude",
        "criado_em": "2026-07-08T12:00:00",
    }
    base.update(kwargs)
    return base


def _corte(**kwargs) -> dict:
    base = {
        "id": "c-1",
        "numero": 1,
        "titulo_proposto": "Título proposto pela IA",
        "titulo_youtube": "",
        "inicio_seg": 100.0,
        "fim_seg": 700.0,
        "status": "aprovado",
        "desvios": [],
    }
    base.update(kwargs)
    return base


# ── D-334: contagem de gerações de trechos ────────────────────────────────────


def test_trechos_geracoes_ausente_no_corte_conta_como_zero_sem_dividir_por_zero():
    diff = diff_proposta_vs_final(_snapshot(), _corte())

    assert diff["trechos_geracoes"] == 0
    assert diff["desvios_claude_por_geracao"] == 0.0


def test_desvios_claude_por_geracao_e_o_total_de_claude_sobre_geracoes():
    finais = [
        _desvio(300.0, 320.0, origem="claude"),
        _desvio(400.0, 420.0, origem="claude"),
        _desvio(500.0, 520.0, origem="claude"),
    ]
    diff = diff_proposta_vs_final(
        _snapshot(desvios=[]),
        _corte(desvios=finais, trechos_geracoes=2),
    )

    assert diff["trechos_geracoes"] == 2
    assert diff["desvios_claude_por_geracao"] == 1.5


def test_trechos_geracoes_reportado_tambem_sem_snapshot():
    diff = diff_proposta_vs_final(
        None,
        _corte(desvios=[_desvio(10.0, 20.0, origem="claude")], trechos_geracoes=1),
        projeto_tem_snapshots=True,
    )

    assert diff["trechos_geracoes"] == 1
    assert diff["desvios_claude_por_geracao"] == 1.0


def _desvio(inicio: float, fim: float, **kwargs) -> dict:
    base = {"inicio_seg": inicio, "fim_seg": fim, "motivo": "digressão"}
    base.update(kwargs)
    return base


# ── bordas ──────────────────────────────────────────────────────────────────


def test_borda_movida_gera_deltas_de_inicio_fim_e_duracao():
    diff = diff_proposta_vs_final(
        _snapshot(inicio_seg=100.0, fim_seg=700.0),
        _corte(inicio_seg=130.0, fim_seg=670.0),
    )

    assert diff["situacao"] == SITUACAO_COM_SNAPSHOT
    bordas = diff["bordas"]
    assert bordas["delta_inicio_seg"] == 30.0
    assert bordas["delta_fim_seg"] == -30.0
    assert bordas["duracao_proposta_seg"] == 600.0
    assert bordas["duracao_final_seg"] == 540.0
    assert bordas["delta_duracao_seg"] == -60.0


def test_borda_intocada_tem_deltas_zero():
    diff = diff_proposta_vs_final(_snapshot(), _corte())

    assert diff["bordas"]["delta_inicio_seg"] == 0.0
    assert diff["bordas"]["delta_fim_seg"] == 0.0
    assert diff["bordas"]["delta_duracao_seg"] == 0.0


# ── desvios ─────────────────────────────────────────────────────────────────


def test_desvio_da_ia_rejeitado_pelo_editor_conta_como_removido():
    proposto = _desvio(200.0, 230.0)
    diff = diff_proposta_vs_final(
        _snapshot(desvios=[proposto]),
        _corte(desvios=[]),
    )

    desvios = diff["desvios"]
    assert desvios["propostos"] == 1
    assert desvios["removidos"] == [proposto]
    assert desvios["mantidos"] == []
    assert desvios["adicionados"] == []


def test_desvio_mantido_dentro_da_tolerancia_de_borda():
    quase_igual = _desvio(
        200.0 + TOLERANCIA_BORDA_DESVIO_SEG / 2,
        230.0 - TOLERANCIA_BORDA_DESVIO_SEG / 2,
    )
    diff = diff_proposta_vs_final(
        _snapshot(desvios=[_desvio(200.0, 230.0)]),
        _corte(desvios=[quase_igual]),
    )

    desvios = diff["desvios"]
    assert len(desvios["mantidos"]) == 1
    assert desvios["removidos"] == []
    assert desvios["adicionados"] == []


def test_desvio_com_borda_alem_da_tolerancia_vira_removido_mais_adicionado():
    diff = diff_proposta_vs_final(
        _snapshot(desvios=[_desvio(200.0, 230.0)]),
        _corte(desvios=[_desvio(200.0, 230.0 + TOLERANCIA_BORDA_DESVIO_SEG + 1)]),
    )

    desvios = diff["desvios"]
    assert len(desvios["removidos"]) == 1
    assert len(desvios["adicionados"]) == 1


def test_desvios_adicionados_agrupados_por_origem():
    finais = [
        _desvio(300.0, 320.0, origem="claude"),
        _desvio(400.0, 420.0, origem="tecnico"),
        _desvio(500.0, 520.0),  # sem origem → manual (editor na timeline)
    ]
    diff = diff_proposta_vs_final(_snapshot(desvios=[]), _corte(desvios=finais))

    desvios = diff["desvios"]
    assert len(desvios["adicionados"]) == 3
    assert desvios["adicionados_por_origem"] == {"claude": 1, "tecnico": 1, "manual": 1}


def test_desvio_legado_so_com_hms_e_casado_pela_conversao():
    """Desvios antigos podem não ter *_seg — o casamento cai no HMS."""
    diff = diff_proposta_vs_final(
        _snapshot(desvios=[{"inicio_hms": "00:03:20", "fim_hms": "00:03:50", "motivo": "chat"}]),
        _corte(desvios=[_desvio(200.0, 230.0)]),
    )

    assert len(diff["desvios"]["mantidos"]) == 1


# ── título e status ─────────────────────────────────────────────────────────


def test_titulo_alterado_via_metadado_marca_mudou():
    diff = diff_proposta_vs_final(
        _snapshot(titulo_proposto="Título proposto pela IA"),
        _corte(titulo_youtube="Título final que o editor escolheu"),
    )

    assert diff["titulo"]["mudou"] is True
    assert diff["titulo"]["proposto"] == "Título proposto pela IA"
    assert diff["titulo"]["final"] == "Título final que o editor escolheu"


def test_titulo_sem_metadado_usa_o_titulo_proposto_atual_do_corte():
    diff = diff_proposta_vs_final(
        _snapshot(titulo_proposto="Título proposto pela IA"),
        _corte(titulo_youtube="", titulo_proposto="Título proposto pela IA"),
    )

    assert diff["titulo"]["mudou"] is False


def test_status_final_e_origem_da_analise_sao_reportados():
    diff = diff_proposta_vs_final(
        _snapshot(origem_analise="manual"),
        _corte(status="rejeitado"),
    )

    assert diff["status_final"] == "rejeitado"
    assert diff["origem_analise"] == "manual"


# ── cortes sem snapshot ─────────────────────────────────────────────────────


def test_corte_manual_em_projeto_com_telemetria_e_sem_proposta_ia():
    diff = diff_proposta_vs_final(
        None,
        _corte(desvios=[_desvio(10.0, 20.0, origem="tecnico")]),
        projeto_tem_snapshots=True,
    )

    assert diff["situacao"] == SITUACAO_SEM_PROPOSTA_IA
    assert diff["titulo"]["proposto"] is None
    assert diff["bordas"]["inicio_proposto_seg"] is None
    assert diff["desvios"]["propostos"] is None
    assert diff["desvios"]["finais"] == 1
    assert diff["desvios"]["finais_por_origem"] == {"tecnico": 1}


def test_corte_legado_em_projeto_sem_nenhum_snapshot_e_sem_snapshot():
    diff = diff_proposta_vs_final(None, _corte(), projeto_tem_snapshots=False)

    assert diff["situacao"] == SITUACAO_SEM_SNAPSHOT
    assert diff["bordas"]["duracao_final_seg"] == 600.0


# ── CSV ─────────────────────────────────────────────────────────────────────


def test_csv_tem_header_canonico_e_uma_linha_por_corte():
    com_snapshot = diff_proposta_vs_final(
        _snapshot(desvios=[_desvio(200.0, 230.0)]),
        _corte(inicio_seg=130.0, desvios=[]),
    )
    com_snapshot["projeto_id"] = "p-1"
    com_snapshot["projeto_titulo"] = "Live, com vírgula no título"

    manual = diff_proposta_vs_final(None, _corte(id="c-2", numero=2), projeto_tem_snapshots=True)
    manual["projeto_id"] = "p-1"
    manual["projeto_titulo"] = "Live, com vírgula no título"

    csv_texto = telemetria_csv([com_snapshot, manual])
    linhas = csv_texto.strip().split("\n")

    assert linhas[0] == ",".join(COLUNAS_CSV_TELEMETRIA)
    assert len(linhas) == 3  # header + 2 cortes
    # vírgula no título não pode quebrar a coluna (quoting do csv module)
    assert '"Live, com vírgula no título"' in linhas[1]
    assert "sem_proposta_ia" in linhas[2]


def test_csv_com_snapshot_sem_adicoes_reporta_zero_e_nao_vazio():
    diff = diff_proposta_vs_final(_snapshot(), _corte())
    diff["projeto_id"] = "p-1"
    diff["projeto_titulo"] = "L"

    linha = telemetria_csv([diff]).strip().split("\n")[1]
    colunas = dict(zip(COLUNAS_CSV_TELEMETRIA, linha.split(","), strict=True))

    assert colunas["desvios_adicionados_claude"] == "0"
    assert colunas["desvios_adicionados_manual"] == "0"


def test_csv_sem_snapshot_deixa_colunas_de_proposta_vazias():
    diff = diff_proposta_vs_final(None, _corte(), projeto_tem_snapshots=False)
    diff["projeto_id"] = "p-1"
    diff["projeto_titulo"] = "L"

    linha = telemetria_csv([diff]).strip().split("\n")[1]
    colunas = dict(zip(COLUNAS_CSV_TELEMETRIA, linha.split(","), strict=True))

    assert colunas["situacao"] == "sem_snapshot"
    assert colunas["inicio_proposto_seg"] == ""
    assert colunas["desvios_adicionados_claude"] == ""
    assert colunas["duracao_final_seg"] == "600.0"
    assert colunas["trechos_geracoes"] == "0"
    assert colunas["desvios_claude_por_geracao"] == "0.0"
