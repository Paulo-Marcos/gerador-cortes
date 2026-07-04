"""Cliente para a fila JSON do `video-renderer/native_worker.js`.

Esta camada isola o backend do detalhe de IPC com o worker Node.js.
O protocolo é estável: um arquivo `req_{job_id}.json` na fila inicia o
trabalho; um `res_{job_id}.json` na mesma pasta sinaliza a conclusão
(com status `sucesso` ou `erro`).

A espera pelo arquivo de resposta usa `watchfiles.awatch` (eventos do
filesystem em tempo real) sob `asyncio.timeout` — fallback automático
para polling se o watcher levantar qualquer erro.

Por que existir uma camada separada
-----------------------------------
- `pipeline_render.py` (camada de aplicação) deve descrever ORQUESTRAÇÃO,
  não IPC. Antes dessa extração, o módulo carregava 100+ linhas de
  detalhes de protocolo, watcher e polling embutidos.
- Categorias de job (bundle/grade/overlay/render_final) viajam no payload
  para que o worker possa decidir paralelismo entre jobs compatíveis
  (ex.: bundle Node ∥ grade FFmpeg/QSV — não competem por recursos).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SEC = 0.5


class WorkerJobCategory(StrEnum):
    """Categoria do job — usada pelo worker para decisão de paralelismo.

    Compatibilidades padrão (definidas no `native_worker.js`):
      - BUNDLE ∥ GRADE     (Node/CPU/disco  ∥  FFmpeg/QSV/GPU)
      - OVERLAY ∥ OVERLAY  (até MAX_PARALLEL_OVERLAYS)

    DEFAULT é tratado como exclusivo (sem paralelismo).
    """

    DEFAULT = "default"
    BUNDLE = "bundle"
    GRADE = "grade"
    OVERLAY = "overlay"
    RENDER_FINAL = "render_final"


@dataclass(frozen=True)
class WorkerJob:
    """Especificação imutável de um job a despachar para o worker.

    Atributos:
      id: Identificador único na fila (compoe `req_{id}.json`/`res_{id}.json`).
      cmd: Argv completo a executar no worker (já com paths absolutos).
      cwd: Diretório de trabalho do subprocesso.
      category: Categoria para decisão de paralelismo no worker.
      timeout_sec: Tempo máximo de espera pela resposta. Após isso,
        `RemotionWorkerQueue.submit_and_wait` levanta `WorkerJobTimeout`.
    """

    id: str
    cmd: list[str]
    cwd: Path
    category: WorkerJobCategory = WorkerJobCategory.DEFAULT
    timeout_sec: int = 600


class WorkerJobTimeout(RuntimeError):
    """Worker não respondeu dentro do `timeout_sec` configurado."""


class WorkerJobFailed(RuntimeError):
    """Worker respondeu mas com `status != "sucesso"`."""


class RemotionWorkerQueue:
    """Cliente fino para a fila de jobs do `native_worker.js`.

    Não mantém estado global: cada instância opera sobre o diretório de
    fila informado. Threads/coroutines diferentes podem usar a mesma
    instância — a contenção é resolvida pelo worker (que decide qual job
    iniciar primeiro com base em `canStartJob`).
    """

    def __init__(self, fila_dir: Path) -> None:
        self._fila_dir = Path(fila_dir)

    @property
    def fila_dir(self) -> Path:
        return self._fila_dir

    async def submit_and_wait(self, job: WorkerJob, *, log_level: str = "disabled") -> None:
        """Enfileira `job` e bloqueia até o worker escrever a resposta.

        Levanta `WorkerJobTimeout` se exceder `job.timeout_sec`, ou
        `WorkerJobFailed` se a resposta indicar erro.
        """
        self._fila_dir.mkdir(parents=True, exist_ok=True)
        queue_id = _queue_job_id(job)
        req_file = self._fila_dir / f"req_{queue_id}.json"
        res_file = self._fila_dir / f"res_{queue_id}.json"

        _remover_se_existir(req_file)
        _remover_se_existir(res_file)
        _remover_arquivos_legados(self._fila_dir, job.id, queue_id)

        payload = {
            "id": queue_id,
            "logical_id": job.id,
            "cwd": str(Path(job.cwd).absolute()),
            "cmd": [str(c) for c in job.cmd],
            "log_level": log_level,
            "category": job.category.value,
        }

        logger.info(
            "[WorkerQueue] Enfileirando job=%s fila=%s categoria=%s",
            job.id,
            queue_id,
            job.category.value,
        )
        _escrever_json(req_file, payload)

        if not await _aguardar_arquivo_de_resposta(res_file, timeout=job.timeout_sec):
            raise WorkerJobTimeout(
                f"Worker não respondeu para job '{job.id}' em {job.timeout_sec}s"
            )

        resultado = _ler_e_remover_resposta(res_file, job_id=job.id)
        if resultado.get("status") != "sucesso":
            raise WorkerJobFailed(f"Job '{job.id}' falhou: {resultado.get('erro', 'desconhecido')}")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers privados — uma responsabilidade cada, todos testáveis isoladamente.
# ─────────────────────────────────────────────────────────────────────────────


def _remover_se_existir(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError as e:
        logger.warning("[WorkerQueue] Não foi possível remover %s: %s", path, e)


def _queue_job_id(job: WorkerJob) -> str:
    """Cria id unico para req/res mesmo quando o pipeline usa nomes genericos."""
    digest = hashlib.sha256()
    digest.update(str(Path(job.cwd).absolute()).encode("utf-8", errors="ignore"))
    digest.update(b"\0")
    for arg in job.cmd:
        digest.update(str(arg).encode("utf-8", errors="ignore"))
        digest.update(b"\0")

    safe_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", job.id).strip("._-") or "job"
    return f"{safe_id}_{digest.hexdigest()[:12]}"


def _remover_arquivos_legados(fila_dir: Path, job_id: str, queue_id: str) -> None:
    """Remove req/res antigos que usavam somente `job.id` como nome."""
    if queue_id == job_id:
        return

    _remover_se_existir(fila_dir / f"req_{job_id}.json")
    _remover_se_existir(fila_dir / f"res_{job_id}.json")


def _escrever_json(path: Path, payload: dict) -> None:
    # Escrita ATOMICA: grava num `.tmp` e renomeia (os.replace e atomico no
    # NTFS). Sem isso, o worker podia ler um req_*.json pela metade (JSON
    # parcial) sob carga e tratar como erro. O `.tmp` nao casa o filtro do
    # worker (req_*.json), entao nunca e pego no meio da escrita.
    tmp = path.with_name(f"{path.name}.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    os.replace(tmp, path)


def _ler_e_remover_resposta(res_file: Path, *, job_id: str) -> dict:
    try:
        with res_file.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise WorkerJobFailed(f"Falha ao ler resposta do Worker para '{job_id}': {e}") from e
    finally:
        _remover_se_existir(res_file)


async def _aguardar_arquivo_de_resposta(res_file: Path, *, timeout: int) -> bool:
    """Aguarda o aparecimento de `res_file`, retornando True se apareceu
    dentro de `timeout` segundos.

    Estratégia:
      1. Curto-circuito se o arquivo já existe.
      2. `watchfiles.awatch` sob `asyncio.timeout(...)` para latência ~ms.
      3. Fallback de polling (intervalo `_POLL_INTERVAL_SEC`) se o watcher
         lançar qualquer erro (incluindo TypeErrors por API quebrada,
         ImportError no Windows sem libs, etc).
    """
    if res_file.exists():
        return True

    try:
        from watchfiles import awatch  # type: ignore[import-not-found]
    except ImportError:
        return await _polling_existencia(res_file, timeout=timeout, intervalo=_POLL_INTERVAL_SEC)

    try:
        return await _watch_until_present(awatch, res_file, timeout=timeout)
    except TimeoutError:
        return res_file.exists()
    except Exception as e:
        logger.warning(
            "[WorkerQueue] Watcher falhou para %s, caindo para polling: %s",
            res_file.name,
            e,
        )
        return await _polling_existencia(res_file, timeout=timeout, intervalo=_POLL_INTERVAL_SEC)


async def _watch_until_present(awatch, res_file: Path, *, timeout: int) -> bool:
    """Itera eventos do `awatch` até o `res_file` aparecer ou o timeout
    expirar. Levanta `asyncio.TimeoutError` no estouro de tempo.

    `awatch` recebe APENAS o caminho — passar `timeout=...` é incorreto
    na API atual do `watchfiles` (≥ 0.x): o parâmetro existente
    (`rust_timeout`) controla o passo interno do polling Rust, não o
    timeout total da iteração. O timeout total é responsabilidade do
    `asyncio.timeout` envolvendo este método.
    """
    fila_dir = res_file.parent
    fila_dir.mkdir(parents=True, exist_ok=True)
    nome_alvo = res_file.name

    async with asyncio.timeout(timeout):
        async for changes in awatch(str(fila_dir)):
            for _change, raw_path in changes:
                if Path(raw_path).name == nome_alvo:
                    return True
            # Defesa contra FS que perdem eventos (CIFS/SMB):
            # cada lote, releu o disco como sanity check.
            if res_file.exists():
                return True
    return res_file.exists()


async def _polling_existencia(res_file: Path, *, timeout: int, intervalo: float) -> bool:
    """Fallback puro: poll de existência até `timeout` ou o arquivo aparecer."""
    elapsed = 0.0
    while elapsed < timeout:
        if res_file.exists():
            return True
        await asyncio.sleep(intervalo)
        elapsed += intervalo
    return res_file.exists()
