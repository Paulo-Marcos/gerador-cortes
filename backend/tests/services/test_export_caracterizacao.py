"""Testes de caracterização de ExportService (E-006).

Fixam o comportamento observável ANTES do fatiamento por mixins, para provar
que a reorganização (mover métodos para classes-mixin recompostas em
`ExportService`) não muda a superfície pública nem o comportamento das partes
testáveis. NÃO exercitam FFmpeg/worker real — só a API, o estado de classe e os
helpers puros.
"""

import inspect
from pathlib import Path

import pytest
from app.services.export import ExportService


class TestSuperficePublica:
    """Toda a API pública + helpers internos continuam acessíveis em
    ExportService (via herança de mixins após o fatiamento)."""

    METODOS_PUBLICOS = [
        "get_tarefa_corte_status",
        "set_tarefa_corte_status",
        "get_fila_processamento",
        "get_fila_youtube",
        "cortar_todos_impl",
        "gerar_todos_brutos_e_scripts_impl",
        "bulk_processar_impl",
        "bulk_upload_youtube_impl",
        "gerar_csv_losslesscut",
        "gerar_csv_desvios_corte",
        "cortar_clip_lossless",
        "processar_desvios_rerender",
        "gerar_bruto_via_worker",
        "processar_clip",
        "processar_multiversion",
        "aplicar_faststart",
        "gerar_scripts_losslesscut_logic",
    ]

    METODOS_INTERNOS = [
        "_montar_agenda_youtube",
        "_run_youtube_upload_queue",
        "_upload_youtube_item",
        "_marcar_restantes_cota_excedida",
        "_run_cmd_via_worker",
        "_probe_duracao",
        "_resolver_video_path",
        "_aplicar_audio_offset",
        "_ffmpeg_corte_simples",
        "_ffmpeg_concat",
        "_rerender_by_reencode_segments_local",
        "_normalizar_audio",
        "_adicionar_intro_outro",
        "_gerar_metadados_txt",
    ]

    @pytest.mark.parametrize("nome", METODOS_PUBLICOS + METODOS_INTERNOS)
    def test_metodo_existe_e_e_callable(self, nome):
        assert hasattr(ExportService, nome), f"ExportService perdeu {nome}"
        assert callable(getattr(ExportService, nome))

    def test_estado_de_classe_presente(self):
        assert ExportService._SEGMENT_FALLBACK_THRESHOLD == 10
        assert isinstance(ExportService._tarefas_corte, dict)
        assert isinstance(ExportService._fila_processamento, dict)
        assert isinstance(ExportService._fila_youtube, dict)


class TestMontarAgendaYoutube:
    def test_pareia_ids_com_datas_na_ordem(self):
        agenda = ExportService._montar_agenda_youtube(["a", "b"], ["2026-01-01", "2026-01-02"])
        assert agenda == [("a", "2026-01-01"), ("b", "2026-01-02")]

    def test_datas_faltando_viram_none(self):
        agenda = ExportService._montar_agenda_youtube(["a", "b", "c"], ["2026-01-01"])
        assert agenda == [("a", "2026-01-01"), ("b", None), ("c", None)]

    def test_sem_cortes_retorna_vazio(self):
        assert ExportService._montar_agenda_youtube([], []) == []


class TestMarcarRestantesCotaExcedida:
    def test_marca_todos_restantes(self):
        projeto_id = "proj-carac-1"
        ExportService._fila_youtube[projeto_id] = {}
        try:
            ExportService._marcar_restantes_cota_excedida(projeto_id, ["x", "y"])
            assert ExportService._fila_youtube[projeto_id] == {
                "x": "cota_excedida",
                "y": "cota_excedida",
            }
        finally:
            ExportService._fila_youtube.pop(projeto_id, None)

    def test_lista_vazia_nao_cria_entradas(self):
        projeto_id = "proj-carac-2"
        ExportService._fila_youtube[projeto_id] = {}
        try:
            ExportService._marcar_restantes_cota_excedida(projeto_id, [])
            assert ExportService._fila_youtube[projeto_id] == {}
        finally:
            ExportService._fila_youtube.pop(projeto_id, None)


class TestTarefaCorteStatus:
    def test_status_default_nao_iniciado(self):
        assert ExportService.get_tarefa_corte_status("inexistente-xyz") == "nao_iniciado"

    def test_set_e_get(self):
        cid = "corte-carac-1"
        try:
            ExportService.set_tarefa_corte_status(cid, "cortando")
            assert ExportService.get_tarefa_corte_status(cid) == "cortando"
        finally:
            ExportService._tarefas_corte.pop(cid, None)

    def test_getters_de_fila_retornam_os_dicts_de_classe(self):
        assert ExportService.get_fila_processamento() is ExportService._fila_processamento
        assert ExportService.get_fila_youtube() is ExportService._fila_youtube


class TestResolverVideoPath:
    def test_usa_arquivo_video_path_quando_existe(self, tmp_path):
        video = tmp_path / "orig.mp4"
        video.write_bytes(b"x")

        class _Proj:
            arquivo_video_path = str(video)

        resolvido = ExportService._resolver_video_path(_Proj(), "proj")
        assert resolvido == Path(str(video))

    def test_retorna_none_quando_nada_existe(self):
        # Projeto sem arquivo_video_path e id inexistente sob projetos_dir():
        # nenhum candidato existe -> None. Independe de qual módulo expõe
        # `projetos_dir` (robusto ao fatiamento).
        class _Proj:
            arquivo_video_path = None

        assert (
            ExportService._resolver_video_path(_Proj(), "proj-inexistente-caracterizacao-xyz")
            is None
        )

    def test_metodos_estaticos_sao_staticmethod(self):
        # `_montar_agenda_youtube` e `_resolver_video_path` são staticmethods —
        # o descriptor não deve virar classmethod no fatiamento.
        for nome in ("_montar_agenda_youtube", "_resolver_video_path", "_probe_duracao"):
            assert isinstance(inspect.getattr_static(ExportService, nome), staticmethod)
