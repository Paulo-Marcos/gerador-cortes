"""Mixin de estado/fila e orquestração em lote do ExportService.

Extraído de `export` (E-006). Guarda os acessores de estado por corte, os
disparos em lote (cortar todos, gerar brutos, processar, upload YouTube) e a
fila de upload com controle de cota. Todos os métodos resolvem irmãos via
`cls.` — a classe final `ExportService` recompõe os mixins e detém o estado.
"""

import asyncio

from app.services.app_logging import operational_info
from app.services.tasks import fire_and_forget

# D-364: o render final em lote roda SEQUENCIAL (1 corte por vez). Cada corte
# dispara ffmpeg pesado (normalização + filtro + intro/outro); rodar vários em
# paralelo estoura CPU/RAM da máquina do editor. A fila (`_fila_processamento`)
# continua mostrando o progresso — só um fica "processando" de cada vez.


class _ExportBulkQueueMixin:
    @classmethod
    def get_tarefa_corte_status(cls, corte_id: str) -> str:
        return cls._tarefas_corte.get(corte_id, "nao_iniciado")

    @classmethod
    def set_tarefa_corte_status(cls, corte_id: str, status: str):
        cls._tarefas_corte[corte_id] = status

    @classmethod
    def get_tarefas_corte(cls) -> dict[str, str]:
        """Cópia do mapa corte→status do gerar-bruto (D-417: fila global)."""
        return dict(cls._tarefas_corte)

    @classmethod
    def get_fila_processamento(cls) -> dict:
        return cls._fila_processamento

    @classmethod
    def get_fila_youtube(cls) -> dict:
        return cls._fila_youtube

    @classmethod
    def cancelar_item_processamento(cls, corte_id: str) -> bool:
        """Marca um corte da fila de pós como cancelado (D-426).

        Devolve False quando o corte não está numa fila ativa ou já chegou a um
        estado terminal — não há o que cancelar. O item que ainda espera a vez é
        PULADO por `_processar_com_sem`; o que já está processando depende do
        cancelamento dos jobs no native worker (feito por quem chamou).
        """
        for fila in cls._fila_processamento.values():
            status = fila.get(corte_id)
            if status in ("aguardando", "processando"):
                fila[corte_id] = "cancelado"
                operational_info("ExportService", f"Cancelado na fila de pós: {corte_id}")
                return True
        return False

    @classmethod
    async def bulk_upload_youtube_impl(
        cls,
        projeto_id: str,
        corte_ids: list[str],
        scheduled_dates: list[str | None],
    ):
        agenda = cls._montar_agenda_youtube(corte_ids, scheduled_dates)
        if not agenda:
            return

        cls._fila_youtube[projeto_id] = {corte_id: "aguardando" for corte_id, _ in agenda}
        fire_and_forget(
            cls._run_youtube_upload_queue(projeto_id, agenda),
            name=f"yt-upload-{projeto_id[:8]}",
        )

    @staticmethod
    def _montar_agenda_youtube(
        corte_ids: list[str],
        scheduled_dates: list[str | None],
    ) -> list[tuple[str, str | None]]:
        return [
            (corte_id, scheduled_dates[index] if index < len(scheduled_dates) else None)
            for index, corte_id in enumerate(corte_ids)
        ]

    @classmethod
    async def _run_youtube_upload_queue(
        cls,
        projeto_id: str,
        agenda: list[tuple[str, str | None]],
        cleanup_delay: float | None = 300,
    ) -> None:
        if cls._bulk_upload_sem is None:
            cls._bulk_upload_sem = asyncio.Semaphore(1)

        for idx, (corte_id, scheduled_at) in enumerate(agenda):
            resultado = await cls._upload_youtube_item(projeto_id, corte_id, scheduled_at)
            if resultado.get("cota_excedida"):
                restantes = [cid for cid, _ in agenda[idx + 1 :]]
                cls._marcar_restantes_cota_excedida(projeto_id, restantes)
                break

        if cleanup_delay is not None:
            await asyncio.sleep(cleanup_delay)
            cls._fila_youtube.pop(projeto_id, None)

    @classmethod
    async def _upload_youtube_item(
        cls,
        projeto_id: str,
        corte_id: str,
        scheduled_at: str | None,
    ) -> dict:
        from app.services.youtube import YouTubeService

        async with cls._bulk_upload_sem:
            fila = cls._fila_youtube.setdefault(projeto_id, {})
            fila[corte_id] = "enviando"
            operational_info("ExportService", f"Enviando: {corte_id} | Agendado: {scheduled_at}")
            try:
                resultado = await YouTubeService.upload_video(corte_id, scheduled_at=scheduled_at)
            except Exception as exc:
                resultado = {"status": "erro", "mensagem": str(exc)}

            if resultado.get("cota_excedida"):
                fila[corte_id] = "cota_excedida"
            elif resultado.get("status") == "ok":
                fila[corte_id] = "concluido"
            else:
                fila[corte_id] = "erro"
            operational_info("ExportService", f"Resultado: {corte_id}: {resultado}")
            return resultado

    @classmethod
    def _marcar_restantes_cota_excedida(cls, projeto_id: str, corte_ids: list[str]) -> None:
        """Marca cortes restantes como cota_excedida sem tentar upload."""
        fila = cls._fila_youtube.setdefault(projeto_id, {})
        for corte_id in corte_ids:
            fila[corte_id] = "cota_excedida"
        if corte_ids:
            operational_info(
                "ExportService",
                f"Cota YouTube excedida. "
                f"{len(corte_ids)} uploads restantes cancelados. "
                f"Reset ~04h Brasília.",
            )
