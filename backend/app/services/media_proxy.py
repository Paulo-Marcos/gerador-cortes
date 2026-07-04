import asyncio
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from array import array
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.infrastructure.ffmpeg_runner import run_ffmpeg
from app.models import Corte, Projeto
from sqlalchemy.ext.asyncio import AsyncSession


class _KeyedLocks:
    """Fornece um ``asyncio.Lock`` por chave para garantir *single-flight*.

    Duas requisições concorrentes para o mesmo corte (ex.: dois fetches de
    waveform disparados pelo StrictMode em dev, ou waveform + audio-proxy em
    paralelo) compartilham o mesmo lock: a segunda espera a primeira terminar
    e reaproveita o artefato já gerado, em vez de rodar um ffmpeg duplicado
    sobre o mesmo arquivo temporário (origem do 500 intermitente).
    """

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}

    def get(self, key: str) -> asyncio.Lock:
        # Seguro sob asyncio: não há ``await`` entre a leitura e a escrita,
        # então o event loop não intercala outra corrotina aqui.
        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
        return lock


class MediaProxyService:
    WAVEFORM_SAMPLE_RATE = 8000
    MIN_PROXY_BYTES = 64 * 1024
    STALE_PROXY_SECONDS = 3600
    # Buffer (em segundos) ao redor do intervalo do corte usado para gerar
    # o proxy de áudio + waveform da fase 1.  Folga generosa no fim para
    # permitir estender o `fim_seg` sem regenerar o proxy do zero.
    PROXY_PRE_SEC = 60
    PROXY_POST_SEC = 300
    # Seek híbrido: fast-seek (antes do -i) até `start - SEEK_REWIND_SEC`,
    # depois trim preciso (depois do -i) do resto. Evita decodificar o vídeo
    # inteiro desde o segundo 0 (lentidão em cortes tardios) SEM perder a
    # precisão de amostra — o proxy continua começando exatamente em `start_sec`,
    # invariante de que o silencedetect depende (CorteService.detectar_silencios_tecnico).
    SEEK_REWIND_SEC = 30

    # Locks por corte para serializar geração concorrente (single-flight).
    _proxy_locks = _KeyedLocks()
    _waveform_locks = _KeyedLocks()

    @staticmethod
    def get_proxy_path(projeto_id: str, corte_id: str, start_sec: float, end_sec: float) -> str:
        """Retorna o caminho do proxy baseado na versão e hash da duração."""
        proxy_dir = os.path.join(str(projetos_dir()), projeto_id, "proxies")
        params_hash = hashlib.md5(f"{start_sec}_{end_sec}".encode()).hexdigest()[:8]
        return os.path.join(proxy_dir, f"proxy_{corte_id}_v5_{params_hash}.flac")

    @staticmethod
    def _get_refresh_proxy_path(
        projeto_id: str, corte_id: str, start_sec: float, end_sec: float
    ) -> str:
        proxy_dir = os.path.join(str(projetos_dir()), projeto_id, "proxies")
        params_hash = hashlib.md5(f"{start_sec}_{end_sec}".encode()).hexdigest()[:8]
        refresh_id = time.time_ns()
        return os.path.join(proxy_dir, f"proxy_{corte_id}_v5_{params_hash}_{refresh_id}.flac")

    @staticmethod
    def _latest_proxy_path(proxy_dir: str, canonical_path: str) -> str:
        canonical = Path(canonical_path)
        candidates = [canonical] if canonical.exists() else []
        candidates.extend(Path(proxy_dir).glob(f"{canonical.stem}_*.flac"))
        existing = [path for path in candidates if MediaProxyService._is_usable_proxy(path)]
        if not existing:
            return canonical_path
        return str(max(existing, key=lambda path: path.stat().st_mtime))

    @staticmethod
    def _is_usable_proxy(path: Path) -> bool:
        try:
            return (
                path.exists()
                and not path.name.endswith(".tmp.flac")
                and path.stat().st_size > MediaProxyService.MIN_PROXY_BYTES
            )
        except OSError:
            return False

    @staticmethod
    def _limpar_proxies_antigos(proxy_dir: str, corte_id: str, keep_path: str) -> None:
        keep = Path(keep_path)
        now = time.time()
        for path in Path(proxy_dir).glob(f"proxy_{corte_id}_v5_*.flac"):
            if path.name.endswith(".tmp.flac"):
                try:
                    path.unlink()
                except OSError:
                    pass
                continue
            if path == keep:
                continue
            try:
                if now - path.stat().st_mtime < MediaProxyService.STALE_PROXY_SECONDS:
                    continue
                path.unlink()
            except OSError:
                pass

    @staticmethod
    def get_waveform_path(
        projeto_id: str, corte_id: str, start_sec: float, end_sec: float, points: int
    ) -> str:
        """Retorna o cache JSON dos picos usados pela waveform do editor."""
        proxy_dir = os.path.join(str(projetos_dir()), projeto_id, "proxies")
        params_hash = hashlib.md5(f"{start_sec}_{end_sec}_{points}_v1".encode()).hexdigest()[:8]
        return os.path.join(proxy_dir, f"waveform_{corte_id}_v1_{params_hash}.json")

    @staticmethod
    def _calcular_janela_proxy(corte: Corte, projeto: Projeto) -> tuple[float, float]:
        start_sec = max(0.0, float(corte.inicio_seg) - MediaProxyService.PROXY_PRE_SEC)
        requested_end_sec = float(corte.fim_seg) + MediaProxyService.PROXY_POST_SEC
        video_duration = float(projeto.duracao_segundos or 0.0)

        if video_duration > start_sec:
            end_sec = min(requested_end_sec, video_duration)
        else:
            end_sec = requested_end_sec

        if end_sec <= start_sec:
            end_sec = start_sec + 1.0

        return start_sec, end_sec

    @staticmethod
    def _decode_proxy_to_f32(proxy_path: str) -> array:
        cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            proxy_path,
            "-ac",
            "1",
            "-ar",
            str(MediaProxyService.WAVEFORM_SAMPLE_RATE),
            "-f",
            "f32le",
            "-",
        ]
        result = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            capture_output=True,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace")[-500:]
            raise RuntimeError(f"FFmpeg falhou ao extrair waveform: {stderr}")

        raw = result.stdout
        usable = len(raw) - (len(raw) % 4)
        samples = array("f")
        samples.frombytes(raw[:usable])
        if sys.byteorder != "little":
            samples.byteswap()
        return samples

    @staticmethod
    def _calcular_picos(samples: array, target_points: int) -> list[float]:
        if not samples:
            return [0.0] * target_points

        bucket_size = max(1, math.ceil(len(samples) / target_points))
        buckets: list[tuple[float, float]] = []

        for start in range(0, len(samples), bucket_size):
            chunk = samples[start : start + bucket_size]
            if not chunk:
                continue

            peak = max(chunk, key=lambda value: abs(value))
            rms = math.sqrt(sum(value * value for value in chunk) / len(chunk))
            amplitude = (abs(peak) * 0.35) + (rms * 0.65)
            sign = -1.0 if peak < 0 else 1.0
            buckets.append((sign, amplitude))

        if not buckets:
            return [0.0] * target_points

        amplitudes = sorted(amplitude for _, amplitude in buckets)
        percentile_index = min(len(amplitudes) - 1, max(0, int(len(amplitudes) * 0.95)))
        normalizer = max(amplitudes[percentile_index], 0.0001)

        peaks = []
        for sign, amplitude in buckets:
            value = min(1.0, (amplitude / normalizer) ** 0.82)
            peaks.append(round(sign * value, 4))

        return peaks

    @staticmethod
    async def gerar_waveform_peaks(
        corte_id: str,
        db: AsyncSession,
        force: bool = False,
        points: int | None = None,
    ) -> dict:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte nao encontrado")

        projeto = await db.get(Projeto, corte.projeto_id)
        if not projeto:
            raise ValueError("Projeto nao encontrado")

        start_sec, end_sec = MediaProxyService._calcular_janela_proxy(corte, projeto)
        duration = max(1.0, end_sec - start_sec)
        target_points = points or int(duration * 12)
        target_points = max(1200, min(60000, target_points))

        waveform_path = MediaProxyService.get_waveform_path(
            projeto.id,
            corte_id,
            start_sec,
            end_sec,
            target_points,
        )
        os.makedirs(os.path.dirname(waveform_path), exist_ok=True)

        cached = MediaProxyService._ler_waveform_cache(waveform_path) if not force else None
        if cached is not None:
            return cached

        # Single-flight: serializa geração concorrente do mesmo corte e revalida
        # o cache dentro do lock (double-checked locking) — assim a 2ª requisição
        # concorrente reaproveita o JSON recém-escrito em vez de regerar tudo.
        async with MediaProxyService._waveform_locks.get(corte_id):
            cached = MediaProxyService._ler_waveform_cache(waveform_path) if not force else None
            if cached is not None:
                return cached

            proxy_path = await MediaProxyService.gerar_audio_proxy(corte_id, db, force=force)
            if not proxy_path or not os.path.exists(proxy_path):
                raise RuntimeError("Proxy de audio nao encontrado para gerar waveform")

            samples = await asyncio.to_thread(MediaProxyService._decode_proxy_to_f32, proxy_path)
            actual_duration = max(1.0, len(samples) / MediaProxyService.WAVEFORM_SAMPLE_RATE)
            peaks = MediaProxyService._calcular_picos(samples, target_points)
            payload = {
                "corte_id": corte_id,
                "offset_sec": start_sec,
                "duration_sec": actual_duration,
                "sample_rate": MediaProxyService.WAVEFORM_SAMPLE_RATE,
                "points": len(peaks),
                "peaks": peaks,
                "cached": False,
            }

            tmp_path = f"{waveform_path}.{time.time_ns()}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp_path, waveform_path)

            return payload

    @staticmethod
    def _ler_waveform_cache(waveform_path: str) -> dict | None:
        """Lê o cache JSON da waveform, ou ``None`` se não existir."""
        if not os.path.exists(waveform_path):
            return None
        with open(waveform_path, encoding="utf-8") as fh:
            payload = json.load(fh)
        payload["cached"] = True
        return payload

    @staticmethod
    async def gerar_audio_proxy(corte_id: str, db: AsyncSession, force: bool = False) -> str | None:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise ValueError("Corte não encontrado")

        projeto = await db.get(Projeto, corte.projeto_id)
        if not projeto or not projeto.arquivo_video_path:
            raise ValueError("Vídeo original não encontrado")

        video_path = MediaProxyService._resolver_video_path(projeto)
        start_sec, end_sec = MediaProxyService._calcular_janela_proxy(corte, projeto)

        # v4: FLAC mono 22050Hz. MP3 (v3) tinha drift de ~25ms por priming/quantização
        # de frame, dessincronizando os silêncios no wavesurfer. FLAC é lossless e
        # sample-accurate (sem priming), mantendo o tamanho gerenciável (~40MB para 30min).
        # 22050Hz é suficiente para fala (voz humana < 8kHz) e silencedetect.
        # v5: hash da duração no nome invalida o cache se o corte mudar de tamanho.
        canonical_proxy_path = MediaProxyService.get_proxy_path(
            projeto.id, corte_id, start_sec, end_sec
        )
        proxy_dir = os.path.dirname(canonical_proxy_path)
        os.makedirs(proxy_dir, exist_ok=True)

        # Single-flight: serializa geração concorrente do mesmo corte. A 2ª
        # requisição entra aqui só depois da 1ª e encontra o proxy já pronto.
        async with MediaProxyService._proxy_locks.get(corte_id):
            proxy_path = (
                MediaProxyService._get_refresh_proxy_path(projeto.id, corte_id, start_sec, end_sec)
                if force
                else MediaProxyService._latest_proxy_path(proxy_dir, canonical_proxy_path)
            )
            MediaProxyService._remover_proxies_legados(proxy_dir, corte_id)
            MediaProxyService._limpar_proxies_antigos(proxy_dir, corte_id, proxy_path)

            if not MediaProxyService._is_usable_proxy(Path(proxy_path)):
                await MediaProxyService._extrair_proxy_flac(
                    video_path, start_sec, end_sec - start_sec, proxy_path
                )

            return proxy_path

    @staticmethod
    def _resolver_video_path(projeto: Projeto) -> str:
        """Resolve o vídeo original, com fallback para `video.mkv`/`video.mp4`."""
        video_path = str(resolver_do_projeto(projeto.arquivo_video_path, projeto.id))
        if os.path.exists(video_path):
            return video_path

        projeto_dir = projetos_dir() / projeto.id
        for fallback in (projeto_dir / "video.mkv", projeto_dir / "video.mp4"):
            if fallback.exists():
                return str(fallback)

        raise ValueError(f"Arquivo de vídeo não encontrado em: {video_path}")

    @staticmethod
    def _remover_proxies_legados(proxy_dir: str, corte_id: str) -> None:
        """Remove proxies de versões antigas (v1-v4) que ficaram no disco."""
        legados = [
            f"proxy_{corte_id}.wav",
            f"proxy_{corte_id}_v2.wav",
            f"proxy_{corte_id}_v3.mp3",
            f"proxy_{corte_id}_v4.flac",
        ]
        for legacy_name in legados:
            legacy = os.path.join(proxy_dir, legacy_name)
            if os.path.exists(legacy):
                try:
                    os.remove(legacy)
                except OSError:
                    pass

    @staticmethod
    def _build_proxy_cmd(
        video_path: str, start_sec: float, duration: float, dest: str
    ) -> list[str]:
        """Monta o comando ffmpeg do proxy FLAC com seek híbrido.

        highpass=f=80 remove ruído de baixa frequência que confundia o
        silencedetect. O seek híbrido (fast-seek antes do -i + trim preciso
        depois) mantém `dest` começando exatamente em `start_sec`.
        """
        seek_pre = max(0.0, start_sec - MediaProxyService.SEEK_REWIND_SEC)
        fine_seek = start_sec - seek_pre
        return [
            "ffmpeg",
            "-y",
            "-ss",
            str(round(seek_pre, 3)),  # antes do -i: fast seek (não decodifica)
            "-i",
            video_path,
            "-ss",
            str(round(fine_seek, 3)),  # depois do -i: trim preciso do resto
            "-t",
            str(round(duration, 3)),
            "-vn",
            "-c:a",
            "flac",
            "-compression_level",
            "5",
            "-af",
            "highpass=f=80,aresample=22050",
            "-ac",
            "1",
            "-sample_fmt",
            "s16",
            dest,
        ]

    @staticmethod
    async def _extrair_proxy_flac(
        video_path: str, start_sec: float, duration: float, proxy_path: str
    ) -> None:
        """Extrai o proxy FLAC para um tmp único e o promove atomicamente."""
        tmp_proxy_path = f"{proxy_path}.{time.time_ns()}.tmp.flac"
        cmd = MediaProxyService._build_proxy_cmd(video_path, start_sec, duration, tmp_proxy_path)
        result = await run_ffmpeg(cmd, label="ffmpeg_audio_proxy", timeout=600)
        if result.returncode != 0 or not os.path.exists(tmp_proxy_path):
            raise RuntimeError(f"FFmpeg falhou ao gerar proxy de áudio: {result.stderr_tail}")
        os.replace(tmp_proxy_path, proxy_path)
