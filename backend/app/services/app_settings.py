"""Configurações globais persistidas da aplicação."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, replace
from enum import StrEnum
from pathlib import Path
from threading import Lock

from app import channel_paths
from app.channel_paths import projetos_dir
from app.domain.cinema_filters import FILTROS_CINEMA
from app.domain.overlay_codec import OverlayCodec
from app.services import settings_store

DEFAULT_FILTRO_GLOBAL_PADRAO = "bypass_dourado_aberto"


class LogLevel(StrEnum):
    DISABLED = "disabled"
    INFO = "info"
    DEBUG = "debug"


@dataclass(frozen=True)
class RenderSettings:
    """Ajustes do pipeline de renderização final.

    - cooldown_sec: pausa entre renderizações sequenciais de overlay
      (mitiga thermal throttling em hardware antigo). Default 0 — em
      máquinas modernas o cooldown só atrasa.
    - overlay_concurrency: paralelismo passado ao Remotion CLI
      (--concurrency). Default 4. Aumentar exige RAM proporcional.
    - bundle_cache_enabled: reutilizar bundle Remotion entre execuções
      quando o código-fonte não mudou. Default True.
    - overlay_codec: codec de saída dos chunks transparentes de overlay.
      ProRes 4444 (default) é a escolha recomendada para um artefato
      INTERMEDIÁRIO consumido pelo FFmpeg na composição final: o encode no
      Remotion é "Fast" (vs "Very slow" do VP9) e o FFmpeg lê ProRes com
      alpha de forma robusta via `-i` simples. VP9+alpha (.webm) continua
      disponível — é menor em disco, mas exige o decoder `-c:v libvpx-vp9`
      para o alpha sobreviver e encoda muito mais devagar. O tamanho maior
      do .mov é irrelevante: o overlay é descartável após o render final.
    - overlay_max_attempts: número máximo de tentativas de render por
      chunk de overlay antes de desistir. Default 3 (1 + 2 retries).
      Falhas transitórias (Chromium OOM, GPU contention) costumam passar
      na 2ª tentativa. Após esgotar, o chunk é pulado e a composição
      prossegue sem ele (não derruba o pipeline inteiro).
    - grade_global_quality: parâmetro `-global_quality` do encoder QSV
      na Fase 1 (Grade). No QSV, valores maiores = mais comprimido.
      Default 30 — o `clip_graded.mp4` é intermediário, descartado após
      o render final; vale priorizar tamanho/velocidade. Aumentar para
      ~33 acelera mais; voltar para 27 mantém qualidade de referência.
    """

    cooldown_sec: int = 0
    overlay_concurrency: int = 4
    bundle_cache_enabled: bool = True
    overlay_codec: OverlayCodec = OverlayCodec.PRORES_4444
    overlay_max_attempts: int = 3
    grade_global_quality: int = 30

    def to_dict(self) -> dict[str, object]:
        return {
            "cooldown_sec": self.cooldown_sec,
            "overlay_concurrency": self.overlay_concurrency,
            "bundle_cache_enabled": self.bundle_cache_enabled,
            "overlay_codec": self.overlay_codec.value,
            "overlay_max_attempts": self.overlay_max_attempts,
            "grade_global_quality": self.grade_global_quality,
        }

    @staticmethod
    def from_dict(data: dict | None) -> RenderSettings:
        if not isinstance(data, dict):
            return RenderSettings()
        defaults = RenderSettings()
        return RenderSettings(
            cooldown_sec=_coerce_non_negative_int(data.get("cooldown_sec"), defaults.cooldown_sec),
            overlay_concurrency=_coerce_positive_int(
                data.get("overlay_concurrency"), defaults.overlay_concurrency
            ),
            bundle_cache_enabled=_coerce_bool(
                data.get("bundle_cache_enabled"), defaults.bundle_cache_enabled
            ),
            overlay_codec=_coerce_overlay_codec(data.get("overlay_codec"), defaults.overlay_codec),
            overlay_max_attempts=_coerce_positive_int(
                data.get("overlay_max_attempts"), defaults.overlay_max_attempts
            ),
            grade_global_quality=_coerce_grade_quality(
                data.get("grade_global_quality"), defaults.grade_global_quality
            ),
        )


@dataclass(frozen=True)
class AppSettings:
    log_level: LogLevel = LogLevel.DISABLED
    filtro_global_padrao: str = DEFAULT_FILTRO_GLOBAL_PADRAO
    # Layout YouTube padrao GLOBAL (escopo da aplicacao, nao do projeto).
    # JSON string com fundo/placa/posicionamento/modo_padrao. F-024:
    # separa do `Projeto.layout_youtube_padrao` (por-projeto) para que o
    # usuario possa "Usar Global" sem afetar o padrao de projeto.
    # Default "{}" significa "sem padrao global definido".
    youtube_layout_padrao_global: str = "{}"
    render: RenderSettings = field(default_factory=RenderSettings)

    def to_dict(self) -> dict[str, object]:
        return {
            "log_level": self.log_level.value,
            "filtro_global_padrao": self.filtro_global_padrao,
            "youtube_layout_padrao_global": self.youtube_layout_padrao_global,
            "render": self.render.to_dict(),
        }


class AppSettingsService:
    """Lê e grava os ajustes de app do canal ativo (D-191).

    FONTE DA VERDADE: o banco de settings (`settings_store`, `instance/settings.db`),
    numa linha por canal. O arquivo `app_settings.json` continua sendo escrito como
    ESPELHO de compatibilidade/backup e serve de FALLBACK+migração: quando o banco
    ainda não tem a linha do canal (primeiro boot após o D-191, ou config trazida da
    PROD em arquivo), o serviço lê o arquivo e SEMEIA o banco a partir dele. A
    interface pública é a mesma de antes — os consumidores não mudam.
    """

    _lock = Lock()
    _cache: AppSettings | None = None
    _settings_path_override: Path | None = None
    _db_path_override: Path | None = None

    @classmethod
    def get(cls) -> AppSettings:
        with cls._lock:
            if cls._cache is None:
                cls._cache = cls._load()
            return cls._cache

    @classmethod
    def update_log_level(cls, log_level: LogLevel) -> AppSettings:
        return cls._update(log_level=log_level)

    @classmethod
    def update_filtro_global_padrao(cls, filtro: str) -> AppSettings:
        return cls._update(filtro_global_padrao=_coerce_filtro_global(filtro))

    @classmethod
    def update_render(cls, render: RenderSettings) -> AppSettings:
        return cls._update(render=render)

    @classmethod
    def update_youtube_layout_padrao_global(cls, layout_json: str) -> AppSettings:
        """Atualiza o padrao GLOBAL do layout YouTube (escopo da aplicacao,
        nao do projeto). Recebe JSON string ja serializada (mesmo formato do
        `Projeto.layout_youtube_padrao`)."""
        return cls._update(youtube_layout_padrao_global=_coerce_layout_global(layout_json))

    @classmethod
    def _update(cls, **campos: object) -> AppSettings:
        """Aplica `campos` sobre o estado atual e persiste (banco + espelho).

        Preserva TODOS os demais campos via `dataclasses.replace` — inclusive o
        `youtube_layout_padrao_global`, que o código legado esquecia de preservar
        num `update_log_level`/`update_filtro`.
        """
        with cls._lock:
            current = cls._cache or cls._load()
            updated = replace(current, **campos)
            cls._persist(updated)
            cls._cache = updated
        return updated

    @classmethod
    def set_settings_path_for_tests(cls, path: Path | None) -> None:
        """Isola o armazenamento num diretório de teste: o espelho JSON vai para
        `path` e o banco de settings para `settings.db` ao lado dele."""
        with cls._lock:
            cls._settings_path_override = path
            cls._db_path_override = (path.parent / "settings.db") if path is not None else None
            cls._cache = None

    @classmethod
    def settings_path(cls) -> Path:
        if cls._settings_path_override is not None:
            return cls._settings_path_override
        return projetos_dir() / "app_settings.json"

    @classmethod
    def _db_path(cls) -> Path:
        if cls._db_path_override is not None:
            return cls._db_path_override
        return channel_paths.settings_db_path()

    @classmethod
    def _channel_id(cls) -> str:
        """Canal cujas app settings estão em jogo. Em teste (path override) usa uma
        chave fixa e isolada; em produção, o nome do canal ativo."""
        if cls._db_path_override is not None:
            return "default"
        return channel_paths.active_channel_root().name

    @classmethod
    def _load(cls) -> AppSettings:
        db_path = cls._db_path()
        channel_id = cls._channel_id()
        row = settings_store.ler_app_settings(db_path, channel_id)
        if row is not None:
            return _app_settings_from_row(row)
        # Sem linha no banco → migra: lê o arquivo legado (fonte da PROD) e semeia.
        from_file = cls._read_file()
        settings_store.gravar_app_settings(db_path, channel_id, _row_from_app_settings(from_file))
        return from_file

    @classmethod
    def _persist(cls, app_settings: AppSettings) -> None:
        settings_store.gravar_app_settings(
            cls._db_path(), cls._channel_id(), _row_from_app_settings(app_settings)
        )
        cls._write_file(app_settings)  # espelho de compatibilidade/backup

    @classmethod
    def _read_file(cls) -> AppSettings:
        path = cls.settings_path()
        if not path.exists():
            return AppSettings()

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return AppSettings()

        return AppSettings(
            log_level=_coerce_log_level(data.get("log_level")),
            filtro_global_padrao=_coerce_filtro_global(data.get("filtro_global_padrao")),
            youtube_layout_padrao_global=_coerce_layout_global(
                data.get("youtube_layout_padrao_global")
            ),
            render=RenderSettings.from_dict(data.get("render")),
        )

    @classmethod
    def _write_file(cls, app_settings: AppSettings) -> None:
        path = cls.settings_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(app_settings.to_dict(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


def _app_settings_from_row(row: dict) -> AppSettings:
    """Constrói `AppSettings` a partir de uma linha do banco, coagindo cada campo
    com os mesmos validadores do caminho de arquivo (defesa contra dados fora de faixa)."""
    render = RenderSettings(
        cooldown_sec=_coerce_non_negative_int(row.get("render_cooldown_sec"), 0),
        overlay_concurrency=_coerce_positive_int(row.get("render_overlay_concurrency"), 4),
        bundle_cache_enabled=bool(row.get("render_bundle_cache_enabled", 1)),
        overlay_codec=_coerce_overlay_codec(
            row.get("render_overlay_codec"), OverlayCodec.PRORES_4444
        ),
        overlay_max_attempts=_coerce_positive_int(row.get("render_overlay_max_attempts"), 3),
        grade_global_quality=_coerce_grade_quality(row.get("render_grade_global_quality"), 30),
    )
    return AppSettings(
        log_level=_coerce_log_level(row.get("log_level")),
        filtro_global_padrao=_coerce_filtro_global(row.get("filtro_global_padrao")),
        youtube_layout_padrao_global=_coerce_layout_global(row.get("youtube_layout_padrao_global")),
        render=render,
    )


def _row_from_app_settings(app: AppSettings) -> dict:
    """Achata `AppSettings` nas colunas da tabela `app_settings`."""
    return {
        "log_level": app.log_level.value,
        "filtro_global_padrao": app.filtro_global_padrao,
        "youtube_layout_padrao_global": app.youtube_layout_padrao_global,
        "render_cooldown_sec": app.render.cooldown_sec,
        "render_overlay_concurrency": app.render.overlay_concurrency,
        "render_bundle_cache_enabled": 1 if app.render.bundle_cache_enabled else 0,
        "render_overlay_codec": app.render.overlay_codec.value,
        "render_overlay_max_attempts": app.render.overlay_max_attempts,
        "render_grade_global_quality": app.render.grade_global_quality,
    }


def _coerce_log_level(raw: object) -> LogLevel:
    try:
        return LogLevel(raw) if raw is not None else LogLevel.DISABLED
    except ValueError:
        return LogLevel.DISABLED


def _coerce_filtro_global(raw: object) -> str:
    if isinstance(raw, str) and raw in FILTROS_CINEMA:
        return raw
    return DEFAULT_FILTRO_GLOBAL_PADRAO


def _coerce_layout_global(raw: object) -> str:
    """Aceita JSON string nao-vazia; default '{}' (sem padrao definido).
    Valida que e JSON parseable; se nao, normaliza para '{}'."""
    if not isinstance(raw, str) or not raw.strip():
        return "{}"
    try:
        json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return "{}"
    return raw


def _coerce_non_negative_int(raw: object, default: int) -> int:
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return value if value >= 0 else default


def _coerce_positive_int(raw: object, default: int) -> int:
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return value if value >= 1 else default


def _coerce_bool(raw: object, default: bool) -> bool:
    if isinstance(raw, bool):
        return raw
    return default


def _coerce_overlay_codec(raw: object, default: OverlayCodec) -> OverlayCodec:
    if isinstance(raw, OverlayCodec):
        return raw
    try:
        return OverlayCodec(raw)  # type: ignore[arg-type]
    except (ValueError, TypeError):
        return default


def _coerce_grade_quality(raw: object, default: int) -> int:
    """QSV `-global_quality` válido: 1–51 (escala estilo CRF, mas QSV usa
    com semântica de Intel: 1=lossless, 51=pior). Valores fora dessa faixa
    indicam erro de configuração — caímos no default por segurança."""
    try:
        value = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return value if 1 <= value <= 51 else default
