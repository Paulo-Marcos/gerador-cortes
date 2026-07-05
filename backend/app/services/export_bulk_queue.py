"""Mixin de estado/fila e orquestração em lote do ExportService.

Extraído de `export` (E-006). Guarda os acessores de estado por corte, os
disparos em lote (cortar todos, gerar brutos, processar, upload YouTube) e a
fila de upload com controle de cota. Todos os métodos resolvem irmãos via
`cls.` — a classe final `ExportService` recompõe os mixins e detém o estado.
"""

import asyncio

from app.services.app_logging import operational_error, operational_info
from app.services.tasks import fire_and_forget


class _ExportBulkQueueMixin:
    @classmethod
    def get_tarefa_corte_status(cls, corte_id: str) -> str:
        return cls._tarefas_corte.get(corte_id, "nao_iniciado")

    @classmethod
    def set_tarefa_corte_status(cls, corte_id: str, status: str):
        cls._tarefas_corte[corte_id] = status

    @classmethod
    def get_fila_processamento(cls) -> dict:
        return cls._fila_processamento

    @classmethod
    def get_fila_youtube(cls) -> dict:
        return cls._fila_youtube

    @classmethod
    async def cortar_todos_impl(cls, projeto_id: str) -> list[str]:
        from app.database import AsyncSessionLocal
        from app.models import Corte, StatusCorte
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.status == StatusCorte.APROVADO)
                .where(Corte.arquivo_clip_path.is_(None))
            )
            cortes = result.scalars().all()

        iniciados = []
        for corte in cortes:
            if cls.get_tarefa_corte_status(corte.id) != "cortando":
                cls.set_tarefa_corte_status(corte.id, "cortando")
                fire_and_forget(cls.cortar_clip_lossless(corte.id), name=f"cortar-{corte.id[:8]}")
                iniciados.append(corte.id)
        return iniciados

    @classmethod
    async def gerar_todos_brutos_e_scripts_impl(cls, projeto_id: str):
        import asyncio

        from app.database import AsyncSessionLocal
        from app.models import Corte
        from sqlalchemy import or_, select

        if cls._bulk_brutos_sem is None:
            cls._bulk_brutos_sem = asyncio.Semaphore(4)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(or_(Corte.arquivo_clip_path.is_(None), Corte.arquivo_clip_path == ""))
            )
            cortes = result.scalars().all()
            corte_ids = [c.id for c in cortes]

        if not corte_ids:
            operational_info(
                "ExportService",
                f"Nenhum bruto pendente para {projeto_id}. Recriando scripts direto.",
            )
            await cls.gerar_scripts_losslesscut_logic(projeto_id)
            return

        async def _cortar_com_sem(corte_id: str):
            async with cls._bulk_brutos_sem:
                cls.set_tarefa_corte_status(corte_id, "cortando")
                try:
                    await cls.cortar_clip_lossless(corte_id)
                    cls.set_tarefa_corte_status(corte_id, "pronto")
                except Exception as e:
                    cls.set_tarefa_corte_status(corte_id, f"erro: {str(e)}")

        operational_info("ExportService", f"Gerando {len(corte_ids)} brutos para {projeto_id}...")
        await asyncio.gather(*[_cortar_com_sem(cid) for cid in corte_ids])

        operational_info("ExportService", "Todos brutos finalizados. Recriando scripts...")
        await cls.gerar_scripts_losslesscut_logic(projeto_id)
        operational_info("ExportService", f"Concluído para projeto {projeto_id}.")

    @classmethod
    async def bulk_processar_impl(cls, projeto_id: str, corte_ids: list[str], filtro: str):
        import asyncio

        if cls._bulk_processar_sem is None:
            cls._bulk_processar_sem = asyncio.Semaphore(4)

        sem = cls._bulk_processar_sem

        cls._fila_processamento[projeto_id] = {cid: "aguardando" for cid in corte_ids}

        async def _processar_com_sem(corte_id: str):
            async with sem:
                cls._fila_processamento[projeto_id][corte_id] = "processando"
                operational_info("ExportService", f"Iniciando: {corte_id} com filtro '{filtro}'")
                try:
                    await cls.processar_clip(corte_id, filtro=filtro)
                    cls._fila_processamento[projeto_id][corte_id] = "concluido"
                    operational_info("ExportService", f"Concluído: {corte_id}")
                except Exception as e:
                    cls._fila_processamento[projeto_id][corte_id] = "erro"
                    operational_error("ExportService", f"Erro: {corte_id}: {e}")

        async def _run_all_processar():
            await asyncio.gather(*[_processar_com_sem(cid) for cid in corte_ids])
            await asyncio.sleep(300)
            cls._fila_processamento.pop(projeto_id, None)

        fire_and_forget(_run_all_processar(), name=f"processar-todos-{projeto_id[:8]}")

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
