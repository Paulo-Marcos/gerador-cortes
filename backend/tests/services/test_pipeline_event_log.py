"""Testes do PipelineEventLog (escrita em .jsonl)."""

import json
from pathlib import Path
from threading import Thread

from app.services.pipeline_event_log import PipelineEventLog

# ─────────────────────────────────────────────────────────────
# Escrita básica
# ─────────────────────────────────────────────────────────────


class TestEmit:
    def test_arquivo_criado_na_pasta_correta(self, tmp_path):
        log_path = tmp_path / "corte_x" / "pipeline_events.jsonl"
        log = PipelineEventLog(log_path, corte_id="corte_x")
        log.emit("pipeline_iniciado")
        assert log_path.exists()

    def test_uma_linha_por_evento(self, tmp_path):
        log_path = tmp_path / "events.jsonl"
        log = PipelineEventLog(log_path, corte_id="x")
        log.emit("pipeline_iniciado")
        log.emit("fase_iniciada", phase="grade")
        log.emit("pipeline_concluido")
        linhas = log_path.read_text(encoding="utf-8").strip().splitlines()
        assert len(linhas) == 3

    def test_cada_linha_e_json_valido(self, tmp_path):
        log = PipelineEventLog(tmp_path / "events.jsonl", corte_id="x")
        log.emit("fase_iniciada", phase="grade", filtro="cinematic_iii")
        log.emit("fase_fim", phase="grade", duration_sec=12.5)
        for linha in (tmp_path / "events.jsonl").read_text(encoding="utf-8").strip().splitlines():
            assert "corte_id" in json.loads(linha)

    def test_corte_id_preenchido_automaticamente(self, tmp_path):
        log = PipelineEventLog(tmp_path / "events.jsonl", corte_id="abc-123")
        log.emit("ping")
        parsed = json.loads((tmp_path / "events.jsonl").read_text(encoding="utf-8").strip())
        assert parsed["corte_id"] == "abc-123"

    def test_kwargs_extras_vao_para_extra(self, tmp_path):
        log = PipelineEventLog(tmp_path / "events.jsonl", corte_id="x")
        log.emit("fase_iniciada", phase="grade", filtro="cinematic_iii", bitrate="8M")
        parsed = json.loads((tmp_path / "events.jsonl").read_text(encoding="utf-8").strip())
        assert parsed["extra"] == {"filtro": "cinematic_iii", "bitrate": "8M"}

    def test_campos_canonicos_nao_caem_em_extra(self, tmp_path):
        log = PipelineEventLog(tmp_path / "events.jsonl", corte_id="x")
        log.emit("chunk_falhou", phase="overlays", chunk_id="002", attempt=3)
        parsed = json.loads((tmp_path / "events.jsonl").read_text(encoding="utf-8").strip())
        assert parsed["phase"] == "overlays"
        assert parsed["chunk_id"] == "002"
        assert parsed["attempt"] == 3
        assert "extra" not in parsed


# ─────────────────────────────────────────────────────────────
# Append-only (não trunca)
# ─────────────────────────────────────────────────────────────


class TestAppendOnly:
    def test_reabrir_log_mantem_eventos_antigos(self, tmp_path):
        path = tmp_path / "events.jsonl"

        log1 = PipelineEventLog(path, corte_id="x")
        log1.emit("primeira_rodada")

        log2 = PipelineEventLog(path, corte_id="x")
        log2.emit("segunda_rodada")

        linhas = path.read_text(encoding="utf-8").strip().splitlines()
        assert len(linhas) == 2
        events = [json.loads(line)["event"] for line in linhas]
        assert events == ["primeira_rodada", "segunda_rodada"]


# ─────────────────────────────────────────────────────────────
# Robustez
# ─────────────────────────────────────────────────────────────


class TestRobustez:
    def test_falha_de_io_nao_propaga(self, tmp_path, monkeypatch):
        """Se a escrita falhar (disco cheio, permissão), o pipeline
        não pode derrubar — emit deve engolir a exceção."""
        log = PipelineEventLog(tmp_path / "events.jsonl", corte_id="x")

        original_open = Path.open

        def open_falha(self, *args, **kwargs):
            if str(self).endswith("events.jsonl"):
                raise OSError("disco cheio")
            return original_open(self, *args, **kwargs)

        monkeypatch.setattr(Path, "open", open_falha)
        # Não deve levantar
        log.emit("evento_que_quebra_disco")

    def test_threads_concorrentes_nao_corrompem_linhas(self, tmp_path):
        """Lock interno garante que threads emitindo simultaneamente
        produzem linhas JSON válidas (sem entrelaçamento)."""
        log = PipelineEventLog(tmp_path / "events.jsonl", corte_id="x")

        def emitir_n_vezes(n: int):
            for i in range(n):
                log.emit("ping", extra_idx=i)

        threads = [Thread(target=emitir_n_vezes, args=(50,)) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        linhas = (tmp_path / "events.jsonl").read_text(encoding="utf-8").strip().splitlines()
        assert len(linhas) == 200
        # Cada linha precisa ser JSON válido (sem entrelaçamento)
        for linha in linhas:
            json.loads(linha)


# ─────────────────────────────────────────────────────────────
# Acessores
# ─────────────────────────────────────────────────────────────


class TestAcessores:
    def test_path_retorna_log_path(self, tmp_path):
        p = tmp_path / "events.jsonl"
        log = PipelineEventLog(p, corte_id="x")
        assert log.path == p

    def test_corte_id_acessivel(self, tmp_path):
        log = PipelineEventLog(tmp_path / "events.jsonl", corte_id="abc")
        assert log.corte_id == "abc"
