"""Testes para `PipelineEvent` (serialização JSON Line)."""

import json
from datetime import UTC

import pytest
from app.domain.pipeline_event import PipelineEvent

# ─────────────────────────────────────────────────────────────
# to_dict — formato canônico
# ─────────────────────────────────────────────────────────────


class TestToDict:
    def test_campos_minimos(self):
        evt = PipelineEvent(corte_id="abc-123", event="pipeline_iniciado")
        d = evt.to_dict(ts="2026-01-01T00:00:00.000000Z")
        assert d == {
            "ts": "2026-01-01T00:00:00.000000Z",
            "corte_id": "abc-123",
            "event": "pipeline_iniciado",
        }

    def test_phase_e_outros_opcionais(self):
        evt = PipelineEvent(
            corte_id="x",
            event="fase_fim",
            phase="grade",
            duration_sec=12.345,
        )
        d = evt.to_dict(ts="t0")
        assert d["phase"] == "grade"
        assert d["duration_sec"] == 12.345

    def test_duration_arredondado_em_3_casas(self):
        evt = PipelineEvent(corte_id="x", event="fase_fim", duration_sec=1.234567)
        d = evt.to_dict(ts="t0")
        assert d["duration_sec"] == 1.235

    def test_extra_serializado_como_subdict(self):
        evt = PipelineEvent(
            corte_id="x",
            event="fase_iniciada",
            phase="grade",
            extra={"filtro": "cinematic_iii", "bitrate": "8M"},
        )
        d = evt.to_dict(ts="t0")
        assert d["extra"] == {"filtro": "cinematic_iii", "bitrate": "8M"}

    def test_extra_vazio_nao_aparece(self):
        evt = PipelineEvent(corte_id="x", event="pipeline_iniciado")
        d = evt.to_dict(ts="t0")
        assert "extra" not in d

    def test_chunk_id_e_attempt_para_falha(self):
        evt = PipelineEvent(
            corte_id="x",
            event="chunk_falhou",
            phase="overlays",
            chunk_id="003",
            attempt=3,
            error_type="RuntimeError",
            error_message="Timeout do worker",
        )
        d = evt.to_dict(ts="t0")
        assert d["chunk_id"] == "003"
        assert d["attempt"] == 3
        assert d["error_type"] == "RuntimeError"
        assert d["error_message"] == "Timeout do worker"

    def test_ts_default_aproximadamente_agora(self):
        from datetime import datetime

        evt = PipelineEvent(corte_id="x", event="ping")
        d = evt.to_dict()
        ts = datetime.strptime(d["ts"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=UTC)
        delta = abs((datetime.now(UTC) - ts).total_seconds())
        assert delta < 5


# ─────────────────────────────────────────────────────────────
# to_json_line — uma linha sem newline final
# ─────────────────────────────────────────────────────────────


class TestToJsonLine:
    def test_resultado_e_string(self):
        evt = PipelineEvent(corte_id="x", event="ping")
        assert isinstance(evt.to_json_line(ts="t0"), str)

    def test_resultado_e_json_valido(self):
        evt = PipelineEvent(corte_id="x", event="ping", phase="grade")
        line = evt.to_json_line(ts="t0")
        # round-trip JSON
        parsed = json.loads(line)
        assert parsed["corte_id"] == "x"
        assert parsed["phase"] == "grade"

    def test_resultado_nao_tem_newline(self):
        evt = PipelineEvent(corte_id="x", event="ping")
        line = evt.to_json_line(ts="t0")
        assert "\n" not in line

    def test_extra_com_unicode_preservado(self):
        evt = PipelineEvent(
            corte_id="x",
            event="fase_iniciada",
            extra={"nome": "Cinemático III"},
        )
        line = evt.to_json_line(ts="t0")
        parsed = json.loads(line)
        assert parsed["extra"]["nome"] == "Cinemático III"


# ─────────────────────────────────────────────────────────────
# Imutabilidade
# ─────────────────────────────────────────────────────────────


class TestImutabilidade:
    def test_event_e_frozen(self):
        evt = PipelineEvent(corte_id="x", event="ping")
        with pytest.raises(Exception):
            evt.event = "alterado"  # type: ignore[misc]

    def test_extra_default_nao_compartilhado_entre_instancias(self):
        a = PipelineEvent(corte_id="x", event="ping")
        b = PipelineEvent(corte_id="x", event="ping")
        # `default_factory=dict` cria dict novo por instância
        assert a.extra is not b.extra
