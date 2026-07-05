"""Mixin de geração de CSV LosslessCut e scripts de abertura do ExportService.

Extraído de `export` (E-006). Gera o CSV do projeto, o CSV/.llc de desvios de um
corte e o .bat que abre todos os cortes no LosslessCut (renomeando clips brutos).
"""

from app.channel_paths import (
    para_relativo_ao_projeto,
    projetos_dir,
    resolver_do_projeto,
)
from app.database import AsyncSessionLocal
from app.domain.csv_builder import build_losslesscut_csv, build_single_cut_desvios_llc
from app.models import Corte, StatusCorte


class _ExportCsvMixin:
    @staticmethod
    async def gerar_csv_losslesscut(projeto_id: str, db=None) -> str:
        """
        Gera CSV compatível com LosslessCut para um projeto.
        Inclui todos os segmentos aprovados e seus desvios (marcados como DESVIO_).
        """
        from sqlalchemy import select

        close_db = False
        if db is None:
            from app.database import AsyncSessionLocal

            db = AsyncSessionLocal()
            close_db = True

        try:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.status.in_([StatusCorte.APROVADO, StatusCorte.PROPOSTO]))
                .order_by(Corte.numero)
            )
            cortes = result.scalars().all()

            csv_content = build_losslesscut_csv(cortes)

            csv_dir = projetos_dir() / projeto_id
            csv_dir.mkdir(parents=True, exist_ok=True)
            csv_path = csv_dir / "losslesscut.csv"
            csv_path.write_text(csv_content, encoding="utf-8")
            return str(csv_path)
        finally:
            if close_db:
                await db.close()

    @staticmethod
    async def gerar_csv_desvios_corte(corte_id: str) -> str:
        """
        Gera um CSV LosslessCut específico para um único corte contendo apenas os tempos de seus desvios.
        O CSV é salvo na pasta do corte para que o usuário possa carregá-lo no LosslessCut.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            stem = "clip_raw_base"
            if corte.arquivo_clip_path:
                p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
                if p.exists():
                    stem = p.stem

            csv_content, llc_json_content = build_single_cut_desvios_llc(corte, stem)

            csv_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
            csv_dir.mkdir(parents=True, exist_ok=True)

            llc_path = csv_dir / f"{stem}-proj.llc"
            llc_path.write_text(llc_json_content, encoding="utf-8")

            csv_path = csv_dir / f"{stem}.csv"
            csv_path.write_text(csv_content, encoding="utf-8")
            return str(csv_path)

    @staticmethod
    async def gerar_scripts_losslesscut_logic(projeto_id: str):
        """
        Gera o arquivo .bat ordenado e recria os .csv nomeando tudo de forma amigável.
        Extraído do router para ser reutilizado pelo pipeline automático.
        """
        import re

        from app.database import AsyncSessionLocal
        from app.services.export import ExportService
        from sqlalchemy import select

        erros = []
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.arquivo_clip_path.is_not(None))
                .order_by(Corte.numero)
            )
            cortes = result.scalars().all()

            for corte in cortes:
                try:
                    # Renomeia os clipes que ainda se chamam "clip_raw_base.mkv"
                    p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
                    if p.exists() and p.name == "clip_raw_base.mkv":
                        safe_title = re.sub(r"[^A-Za-z0-9_\- ]", "", corte.titulo_proposto)
                        safe_title = safe_title.replace(" ", "_")[:40]
                        novo_nome = f"{corte.numero:02d}_{safe_title}.mkv"
                        novo_path = p.with_name(novo_nome)
                        try:
                            p.rename(novo_path)
                            corte.arquivo_clip_path = para_relativo_ao_projeto(
                                str(novo_path), corte.projeto_id
                            )
                            # Precisamos commitar aqui para salvar o novo path no banco
                            await db.commit()
                            await db.refresh(corte)
                        except Exception as ex_ren:
                            erros.append(f"{corte.id} (Rename): {str(ex_ren)}")

                    await ExportService.gerar_csv_desvios_corte(corte.id)
                except Exception as e:
                    erros.append(f"{corte.id}: {str(e)}")

        # Cria o .bat com a ordem EXATA dos cortes usando os caminhos baseados em arquivo_clip_path
        bat_path = projetos_dir() / projeto_id / "A_Abrir_Todos_Losslesscut.bat"
        bat_path.parent.mkdir(parents=True, exist_ok=True)

        conteudo_bat = '@echo off\nchcp 65001 >nul\ncd /d "%~dp0"\necho Abrindo todos os cortes no LosslessCut sequencialmente...\n'
        base_dir = projetos_dir() / projeto_id

        # Recarrega a lista para pegar os paths atualizados se houve rename
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.arquivo_clip_path.is_not(None))
                .order_by(Corte.numero)
            )
            cortes = result.scalars().all()

            for c in cortes:
                if c.arquivo_clip_path:
                    p = resolver_do_projeto(c.arquivo_clip_path, c.projeto_id)
                    try:
                        rel_path = p.relative_to(base_dir)
                        windows_path = str(rel_path).replace("/", "\\")
                        conteudo_bat += f'start "" "{windows_path}"\n'
                    except ValueError:
                        conteudo_bat += f'start "" "{p.resolve()}"\n'

        bat_path.write_text(conteudo_bat, encoding="utf-8")

        return {"message": f"Scripts recriados para {len(cortes)} cortes.", "erros": erros}
