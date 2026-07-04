"""Retencao de artefatos pesados de midia.

Mantem somente o material necessario para reconstruir o pacote final:
`graded/clip_graded.mp4`, `overlays/`, logs, metadados e thumbnails.
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.models import Corte, Projeto

logger = logging.getLogger(__name__)

MIN_VIDEO_BYTES = 1024 * 1024

RAW_NAMES = (
    "clip_raw.mkv",
    "clip_raw.mp4",
    "clip_raw_base.mkv",
    "clip_raw_base.mp4",
    "clip_raw_backup_com_silencios.mkv",
    "clip_raw_backup_com_silencios.mp4",
)
RAW_GLOBS = (
    "clip_raw_*.mkv",
    "clip_raw_*.mp4",
)
ORIGINAL_VIDEO_NAMES = (
    "video.mkv",
    "video.mp4",
    "video.webm",
    "video.mov",
)


@dataclass
class RetentionReport:
    freed_bytes: int = 0
    removidos: list[str] = field(default_factory=list)
    preservados: list[str] = field(default_factory=list)
    pulados: list[str] = field(default_factory=list)
    erros: list[str] = field(default_factory=list)

    @property
    def liberado_mb(self) -> float:
        return round(self.freed_bytes / 1_000_000, 1)

    def merge(self, other: RetentionReport) -> None:
        self.freed_bytes += other.freed_bytes
        self.removidos.extend(other.removidos)
        self.preservados.extend(other.preservados)
        self.pulados.extend(other.pulados)
        self.erros.extend(other.erros)

    def to_dict(self) -> dict[str, object]:
        return {
            "liberado_mb": self.liberado_mb,
            "removidos": self.removidos,
            "preservados": self.preservados,
            "pulados": self.pulados,
            "erros": self.erros,
        }


class MediaRetentionService:
    @classmethod
    def aplicar_apos_grade(cls, corte: Corte) -> RetentionReport:
        """Remove `clip_raw.*` quando o graded ja pode substituir o bruto."""
        return cls._limpar_corte(corte, remover_upload_ready=False)

    @classmethod
    def aplicar_apos_upload(cls, corte: Corte) -> RetentionReport:
        """Remove raw e `upload_ready/video.mp4` apos upload concluido."""
        return cls._limpar_corte(corte, remover_upload_ready=True)

    @classmethod
    def limpar_projeto(cls, projeto: Projeto, cortes: list[Corte]) -> RetentionReport:
        """Limpeza manual do projeto preservando materiais de reconstrucao."""
        report = RetentionReport()
        projeto_dir = cls.projeto_dir(projeto.id)

        report.merge(cls._remover_video_original(projeto, projeto_dir))
        for corte in cortes:
            report.merge(cls.aplicar_apos_upload(corte))

        return report

    @staticmethod
    def projeto_dir(projeto_id: str) -> Path:
        return projetos_dir() / projeto_id

    @classmethod
    def corte_dir(cls, corte: Corte) -> Path:
        return cls.projeto_dir(corte.projeto_id) / "cortes" / corte.id

    @classmethod
    def _limpar_corte(cls, corte: Corte, *, remover_upload_ready: bool) -> RetentionReport:
        report = RetentionReport()
        corte_dir = cls.corte_dir(corte)
        graded = corte_dir / "graded" / "clip_graded.mp4"

        if remover_upload_ready:
            cls._remover_versoes_filtro(corte_dir, report)

        if not cls._video_aproveitavel(graded):
            report.pulados.append(
                f"{corte.id}: graded ausente ou pequeno; raw/upload_ready preservados"
            )
            return report

        report.preservados.append(cls._display(graded))
        overlays_dir = corte_dir / "overlays"
        if overlays_dir.exists():
            report.preservados.append(cls._display(overlays_dir))

        raw_paths = cls._raw_paths(corte, corte_dir)
        for path in raw_paths:
            cls._remover_arquivo(path, report)

        if not cls._arquivo_clip_existente(corte):
            corte.arquivo_clip_path = ""

        if remover_upload_ready:
            cls._remover_arquivo(corte_dir / "upload_ready" / "video.mp4", report)

        return report

    @classmethod
    def _remover_versoes_filtro(cls, corte_dir: Path, report: RetentionReport) -> None:
        versoes_dir = corte_dir / "versoes"
        if not versoes_dir.exists():
            return

        cls._remover_diretorio(versoes_dir, report)

    @classmethod
    def _raw_paths(cls, corte: Corte, corte_dir: Path) -> list[Path]:
        paths: list[Path] = [corte_dir / name for name in RAW_NAMES]
        for pattern in RAW_GLOBS:
            paths.extend(corte_dir.glob(pattern))

        if corte.arquivo_clip_path:
            registered = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
            if cls._is_inside(registered, corte_dir):
                paths.append(registered)

        return cls._unique_paths(paths)

    @classmethod
    def _remover_video_original(cls, projeto: Projeto, projeto_dir: Path) -> RetentionReport:
        report = RetentionReport()
        candidates = [projeto_dir / name for name in ORIGINAL_VIDEO_NAMES]

        if projeto.arquivo_video_path:
            registered = resolver_do_projeto(projeto.arquivo_video_path, projeto.id)
            if cls._is_inside(registered, projeto_dir):
                candidates.append(registered)

        removed_paths = cls._unique_paths(candidates)
        for path in removed_paths:
            cls._remover_arquivo(path, report)

        if not cls._video_original_existente(projeto):
            projeto.arquivo_video_path = ""

        return report

    @staticmethod
    def _video_aproveitavel(path: Path) -> bool:
        return path.exists() and path.is_file() and path.stat().st_size >= MIN_VIDEO_BYTES

    @staticmethod
    def _arquivo_clip_existente(corte: Corte) -> bool:
        return bool(
            corte.arquivo_clip_path
            and resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id).exists()
        )

    @staticmethod
    def _video_original_existente(projeto: Projeto) -> bool:
        return bool(
            projeto.arquivo_video_path
            and resolver_do_projeto(projeto.arquivo_video_path, projeto.id).exists()
        )

    @staticmethod
    def _remover_arquivo(path: Path, report: RetentionReport) -> None:
        if not path.exists() or not path.is_file():
            return

        try:
            size = path.stat().st_size
            path.unlink()
        except PermissionError as exc:
            message = f"{path}: arquivo em uso ({exc})"
            logger.warning("[Retention] %s", message)
            report.erros.append(message)
            return
        except OSError as exc:
            message = f"{path}: falha ao remover ({exc})"
            logger.warning("[Retention] %s", message)
            report.erros.append(message)
            return

        report.freed_bytes += size
        report.removidos.append(MediaRetentionService._display(path))

    @staticmethod
    def _remover_diretorio(path: Path, report: RetentionReport) -> None:
        if not path.exists() or not path.is_dir():
            return

        try:
            size = sum(file.stat().st_size for file in path.rglob("*") if file.is_file())
            shutil.rmtree(path)
        except PermissionError as exc:
            message = f"{path}: diretorio em uso ({exc})"
            logger.warning("[Retention] %s", message)
            report.erros.append(message)
            return
        except OSError as exc:
            message = f"{path}: falha ao remover diretorio ({exc})"
            logger.warning("[Retention] %s", message)
            report.erros.append(message)
            return

        report.freed_bytes += size
        report.removidos.append(f"{MediaRetentionService._display(path)}/")

    @classmethod
    def _is_inside(cls, path: Path, parent: Path) -> bool:
        try:
            cls._resolve(path).relative_to(cls._resolve(parent))
            return True
        except ValueError:
            return False

    @classmethod
    def _unique_paths(cls, paths: list[Path]) -> list[Path]:
        unique: dict[Path, Path] = {}
        for path in paths:
            unique[cls._resolve(path)] = path
        return list(unique.values())

    @staticmethod
    def _resolve(path: Path) -> Path:
        return path.expanduser().resolve(strict=False)

    @staticmethod
    def _display(path: Path) -> str:
        try:
            return str(path.relative_to(projetos_dir()))
        except ValueError:
            return str(path)
