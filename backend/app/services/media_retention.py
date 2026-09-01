"""Retencao de artefatos pesados de midia.

Duas politicas distintas, com objetivos diferentes:

* RETENCAO DE MEIO DE PIPELINE (`aplicar_apos_upload`): roda sozinha ao fim do
  upload e mantem o material necessario para reconstruir o pacote final sem
  re-render — `clip_raw*`, `graded/clip_graded.mp4`, `overlays/`, logs,
  metadados e thumbnails.
* LIMPEZA TERMINAL (`limpar_projeto`): disparada pelo usuario quando o projeto
  ja acabou. Zera TODA a midia pesada e preserva apenas o que documenta o
  trabalho (metadados, legendas, thumbnails, logs).

D-430: o `clip_raw` saiu da retencao de meio de pipeline e passou a ser
descartado SO na limpeza terminal. Ele e o unico artefato que nao da para
reconstruir a partir da pasta do corte — refazer exige re-extrair o trecho da
live — e apaga-lo no fim do render final deixava o usuario sem material quando
o proprio render final saia com erro. Com isso a etapa `aplicar_apos_grade`
ficou sem nada para fazer e foi removida.

D-456: o `clip_raw` de um corte marcado com FIRE tambem sobrevive a limpeza
terminal, por padrao. Ele deixou de ser so um artefato do render e virou a
materia-prima da fabrica de shorts (E-030) — limpar a live junto destruiria a
unica fonte de onde os shorts sao recortados. Quem quiser o disco de volta
precisa dizer isso explicitamente (`preservar_brutos_fire=False`).
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

# Extensoes de midia PESADA que a limpeza terminal remove. Enumerar por extensao
# — e nao por nome de arquivo — porque a pasta do corte acumula video com nome
# editorial livre (ex.: `01_A_Esquerda_....mkv`), chunks de overlay em ProRes e
# proxies de audio; qualquer lista de nomes fixos deixa material para tras.
MEDIA_PESADA_SUFIXOS = frozenset(
    {
        # video
        ".mkv",
        ".mp4",
        ".webm",
        ".mov",
        ".m4v",
        ".avi",
        ".ts",
        # proxies de audio (`proxies/*.flac`) e derivados
        ".flac",
        ".wav",
        ".mp3",
        ".m4a",
        ".aac",
        ".opus",
        # sobras de download interrompido do yt-dlp
        ".part",
        ".ytdl",
    }
)

# Diretorios que sao PURO scratch: nada la dentro sobrevive a limpeza terminal.
# `tmp_rerender_*` sao os `mkdtemp` que `ExportService` cria dentro da pasta do
# corte a cada re-render do bruto e nunca remove; `versoes/` guarda previews de
# filtro; `proxies/` e cache de audio regeravel a partir da live.
SCRATCH_GLOBS = (
    "cortes/*/tmp_rerender_*",
    "cortes/*/versoes",
    "proxies",
)


@dataclass
class RetentionReport:
    freed_bytes: int = 0
    # D-456: quanto disco ficou para tras de proposito (brutos de Fire). E o
    # numero que a tela precisa mostrar para o operador decidir se quer o espaco.
    retido_bytes: int = 0
    removidos: list[str] = field(default_factory=list)
    preservados: list[str] = field(default_factory=list)
    pulados: list[str] = field(default_factory=list)
    erros: list[str] = field(default_factory=list)

    @property
    def liberado_mb(self) -> float:
        return round(self.freed_bytes / 1_000_000, 1)

    @property
    def retido_mb(self) -> float:
        return round(self.retido_bytes / 1_000_000, 1)

    def merge(self, other: RetentionReport) -> None:
        self.freed_bytes += other.freed_bytes
        self.retido_bytes += other.retido_bytes
        self.removidos.extend(other.removidos)
        self.preservados.extend(other.preservados)
        self.pulados.extend(other.pulados)
        self.erros.extend(other.erros)

    def to_dict(self) -> dict[str, object]:
        return {
            "liberado_mb": self.liberado_mb,
            "retido_mb": self.retido_mb,
            "removidos": self.removidos,
            "preservados": self.preservados,
            "pulados": self.pulados,
            "erros": self.erros,
        }


class MediaRetentionService:
    @classmethod
    def aplicar_apos_upload(cls, corte: Corte) -> RetentionReport:
        """Remove `upload_ready/video.mp4` e as previews de filtro apos o upload.

        O `clip_raw` NAO entra aqui (D-430) — so a limpeza terminal o descarta.
        """
        report = RetentionReport()
        corte_dir = cls.corte_dir(corte)
        cls._remover_versoes_filtro(corte_dir, report)

        graded = corte_dir / "graded" / "clip_graded.mp4"
        if not cls._video_aproveitavel(graded):
            report.pulados.append(f"{corte.id}: graded ausente ou pequeno; upload_ready preservado")
            return report

        report.preservados.append(cls._display(graded))
        overlays_dir = corte_dir / "overlays"
        if overlays_dir.exists():
            report.preservados.append(cls._display(overlays_dir))

        cls._remover_arquivo(corte_dir / "upload_ready" / "video.mp4", report)
        return report

    @classmethod
    def limpar_projeto(
        cls,
        projeto: Projeto,
        cortes: list[Corte],
        *,
        preservar_brutos_fire: bool = True,
    ) -> RetentionReport:
        """Limpeza TERMINAL: zera a midia pesada e mantem so o que documenta o trabalho.

        POR QUE nao reusa `aplicar_apos_upload` (D-398): aquela e a retencao de MEIO
        de pipeline e por contrato preserva `graded/` + `overlays/`; alem disso ela
        aborta o corte inteiro quando o graded nao esta la. Aplicada como "limpar
        projeto" ela deixava para tras os overlays (a maior fatia do disco), os
        `tmp_rerender_*` e os proxies de audio — o botao dizia "limpo" com dezenas de
        GB intactos. Aqui a regra e a inversa: sai tudo que e midia, fica o que
        permite REPLICAR o trabalho (metadados, legendas, thumbnails, logs).

        D-456 — `preservar_brutos_fire` (default) poupa o `clip_raw` dos cortes
        marcados com Fire: e dele que os shorts sao recortados. O bruto poupado
        entra em `preservados` e seus bytes em `retido_bytes`, NAO em `pulados` —
        senao o projeto nunca mais seria marcado como limpo.
        """
        report = RetentionReport()
        # `projetos_dir() / ""` resolve para a RAIZ de dados: sem id a varredura
        # recursiva abaixo levaria a midia de todos os projetos do canal.
        if not projeto.id:
            report.erros.append("projeto sem id: limpeza abortada")
            return report

        projeto_dir = cls.projeto_dir(projeto.id)
        if not projeto_dir.is_dir():
            return report

        protegidos = cls._brutos_de_fire(cortes) if preservar_brutos_fire else set()

        for scratch in cls._scratch_dirs(projeto_dir):
            cls._remover_diretorio(scratch, report)

        for arquivo in cls._midia_pesada(projeto_dir, protegidos):
            cls._remover_arquivo(arquivo, report)

        cls._registrar_preservados(protegidos, report)
        cls._esquecer_paths_de_midia(projeto, cortes)
        cls._registrar_residuo(projeto_dir, report, protegidos)
        return report

    @classmethod
    def _brutos_de_fire(cls, cortes: list[Corte]) -> set[Path]:
        """Os `clip_raw*` dos cortes marcados com Fire, resolvidos em disco."""
        protegidos: set[Path] = set()
        for corte in cortes:
            metadado = getattr(corte, "metadado", None)
            if not (metadado and metadado.is_fire):
                continue
            protegidos.update(
                caminho for caminho in cls.corte_dir(corte).glob("clip_raw*") if caminho.is_file()
            )
        return protegidos

    @classmethod
    def _registrar_preservados(cls, protegidos: set[Path], report: RetentionReport) -> None:
        for caminho in sorted(protegidos):
            report.retido_bytes += caminho.stat().st_size
            report.preservados.append(f"{cls._display(caminho)}: bruto de corte Fire")

    @classmethod
    def _scratch_dirs(cls, projeto_dir: Path) -> list[Path]:
        return [
            caminho
            for padrao in SCRATCH_GLOBS
            for caminho in projeto_dir.glob(padrao)
            if caminho.is_dir()
        ]

    @classmethod
    def _midia_pesada(cls, projeto_dir: Path, protegidos: set[Path] | None = None) -> list[Path]:
        poupados = protegidos or set()
        return sorted(
            caminho
            for caminho in projeto_dir.rglob("*")
            if caminho.suffix.lower() in MEDIA_PESADA_SUFIXOS
            and caminho.is_file()
            and caminho not in poupados
        )

    @classmethod
    def _esquecer_paths_de_midia(cls, projeto: Projeto, cortes: list[Corte]) -> None:
        """Zera no banco os ponteiros cujo arquivo a limpeza acabou de remover."""
        if not cls._video_original_existente(projeto):
            projeto.arquivo_video_path = ""
        for corte in cortes:
            if not cls._arquivo_clip_existente(corte):
                corte.arquivo_clip_path = ""

    @classmethod
    def _registrar_residuo(
        cls, projeto_dir: Path, report: RetentionReport, protegidos: set[Path] | None = None
    ) -> None:
        """Anota em `pulados` a midia que sobreviveu — arquivo em uso, por exemplo.

        `ProjetoService` deriva `arquivos_limpos` de `pulados`/`erros`, entao a
        varredura de sobra e o que impede o projeto de ser marcado como limpo
        enquanto ainda houver midia pesada no disco.
        """
        for restante in cls._midia_pesada(projeto_dir, protegidos):
            report.pulados.append(f"{cls._display(restante)}: midia pesada nao removida")

    @staticmethod
    def projeto_dir(projeto_id: str) -> Path:
        return projetos_dir() / projeto_id

    @classmethod
    def corte_dir(cls, corte: Corte) -> Path:
        return cls.projeto_dir(corte.projeto_id) / "cortes" / corte.id

    @classmethod
    def _remover_versoes_filtro(cls, corte_dir: Path, report: RetentionReport) -> None:
        versoes_dir = corte_dir / "versoes"
        if not versoes_dir.exists():
            return

        cls._remover_diretorio(versoes_dir, report)

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

    @staticmethod
    def _display(path: Path) -> str:
        try:
            return str(path.relative_to(projetos_dir()))
        except ValueError:
            return str(path)
