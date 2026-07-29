"""Cliente para a fila JSON do `video-renderer/native_worker.js`.

Esta camada isola o backend do detalhe de IPC com o worker Node.js.
O protocolo é estável: um arquivo `req_{job_id}.json` na fila inicia o
trabalho; um `res_{job_id}.json` na mesma pasta sinaliza a conclusão
(com status `sucesso` ou `erro`).

A espera pelo arquivo de resposta usa `watchfiles.awatch` (eventos do
filesystem em tempo real) sob `asyncio.timeout` — fallback automático
para polling se o watcher levantar qualquer erro.

Dois sinais complementam o par req/res:

- `ack_{id}.json` — o worker COMEÇOU o job. O `timeout_sec` passa a medir
  EXECUÇÃO: enquanto o job espera na fila o relógio não corre. Sem isso
  (D-424), com dois cortes em voo um chunk de overlay estourava os 30 min
  sem nunca ter rodado, e o retry re-submetia por cima do job em execução.
- `cancel_{id}.json` — pedido de cancelamento (D-426). O worker mata a
  árvore de processos e responde `status="cancelado"`, que aqui vira
  `WorkerJobCancelled`.

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
from contextvars import ContextVar
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
      timeout_sec: Tempo máximo de EXECUÇÃO (o relógio só começa a correr
        quando o worker anuncia o início via `ack_`). Após isso,
        `RemotionWorkerQueue.submit_and_wait` levanta `WorkerJobTimeout`.
      owner: Dono lógico do job (normalmente o `corte_id`). Agrupa os jobs
        de um mesmo trabalho para que `cancelar_owner` os cancele juntos.
    """

    id: str
    cmd: list[str]
    cwd: Path
    category: WorkerJobCategory = WorkerJobCategory.DEFAULT
    timeout_sec: int = 600
    owner: str = ""


class WorkerJobTimeout(RuntimeError):
    """Worker não respondeu dentro do `timeout_sec` configurado."""


class WorkerJobFailed(RuntimeError):
    """Worker respondeu mas com `status != "sucesso"`."""


class WorkerJobCancelled(RuntimeError):
    """Job encerrado a pedido do operador (D-426), não por falha."""


# owner → {queue_id: fila_dir}. Só jobs EM VOO (submetidos e ainda sem
# resposta) — é o alvo de `cancelar_owner`. Um dict de módulo basta: tudo roda
# no mesmo event loop e a entrada sai no `finally` do `submit_and_wait`.
_EM_VOO: dict[str, dict[str, Path]] = {}

# Dono default dos jobs submetidos no contexto async atual. O pipeline de
# render marca o corte UMA vez e todos os jobs que ele dispara — grade, bundle,
# cada chunk de overlay, encode final — herdam o dono sem precisar carregar o
# `corte_id` por quatro assinaturas. `create_task` copia o contexto, então as
# fases que rodam em paralelo herdam também.
_DONO_ATUAL: ContextVar[str] = ContextVar("worker_job_owner", default="")


def definir_dono_dos_jobs(owner: str) -> None:
    """Define o dono dos jobs submetidos daqui em diante neste contexto async."""
    _DONO_ATUAL.set(owner)


def cancelar_owner(owner: str) -> int:
    """Pede o cancelamento de todo job em voo de `owner`; devolve quantos.

    Escreve o sentinela `cancel_{id}.json` para cada job. Quem espera recebe
    `WorkerJobCancelled` assim que o worker responder — este método não
    bloqueia nem mata processo nenhum diretamente.
    """
    em_voo = _EM_VOO.get(owner)
    if not em_voo:
        return 0
    pedidos = 0
    for queue_id, fila_dir in list(em_voo.items()):
        try:
            _escrever_json(fila_dir / f"cancel_{queue_id}.json", {"id": queue_id})
            pedidos += 1
        except OSError as e:
            logger.warning("[WorkerQueue] Falha ao pedir cancelamento de %s: %s", queue_id, e)
    logger.info("[WorkerQueue] Cancelamento pedido para %d job(s) de '%s'", pedidos, owner)
    return pedidos


def jobs_em_voo(owner: str) -> int:
    """Quantos jobs de `owner` estão submetidos e ainda sem resposta."""
    return len(_EM_VOO.get(owner, {}))


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
        ack_file = self._fila_dir / f"ack_{queue_id}.json"

        _remover_se_existir(req_file)
        _remover_se_existir(res_file)
        _remover_se_existir(ack_file)
        _remover_se_existir(self._fila_dir / f"cancel_{queue_id}.json")
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
        owner = job.owner or _DONO_ATUAL.get()
        _registrar_em_voo(owner, queue_id, self._fila_dir)

        try:
            respondeu = await _aguardar_arquivo_de_resposta(
                res_file, ack_file, timeout=job.timeout_sec
            )
        finally:
            _esquecer_em_voo(owner, queue_id)

        if not respondeu:
            # Pede o cancelamento antes de desistir: sem isso o job continua
            # rodando no worker e a próxima tentativa re-submete um `req_` com
            # o MESMO nome, que o worker ignora (já está em `activeJobs`) — o
            # retry então esperava o timeout inteiro por uma resposta que
            # ninguém mais ia escrever (D-424).
            _escrever_json(self._fila_dir / f"cancel_{queue_id}.json", {"id": queue_id})
            raise WorkerJobTimeout(
                f"Worker não respondeu para job '{job.id}' em {job.timeout_sec}s de execução"
            )

        resultado = _ler_e_remover_resposta(res_file, job_id=job.id)
        status = resultado.get("status")
        if status == "cancelado":
            raise WorkerJobCancelled(
                f"Job '{job.id}' cancelado: {resultado.get('erro', 'a pedido do operador')}"
            )
        if status != "sucesso":
            raise WorkerJobFailed(f"Job '{job.id}' falhou: {resultado.get('erro', 'desconhecido')}")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers privados — uma responsabilidade cada, todos testáveis isoladamente.
# ─────────────────────────────────────────────────────────────────────────────


def _registrar_em_voo(owner: str, queue_id: str, fila_dir: Path) -> None:
    if not owner:
        return
    _EM_VOO.setdefault(owner, {})[queue_id] = fila_dir


def _esquecer_em_voo(owner: str, queue_id: str) -> None:
    em_voo = _EM_VOO.get(owner)
    if em_voo is None:
        return
    em_voo.pop(queue_id, None)
    if not em_voo:
        _EM_VOO.pop(owner, None)


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


async def _aguardar_arquivo_de_resposta(res_file: Path, ack_file: Path, *, timeout: int) -> bool:
    """Aguarda o `res_file`, com o relógio medindo EXECUÇÃO, não espera.

    O `timeout` vale por VEZ: começa valendo para a espera na fila e é
    reiniciado quando o `ack_file` aparece, isto é, quando o worker começa a
    executar de fato. Sem isso (D-424), um chunk de overlay atrás de outros
    jobs estourava o próprio orçamento de render antes de rodar — e o retry
    re-submetia por cima de um job que o worker já estava executando.

    Devolve True se o `res_file` apareceu; False no estouro de tempo.
    """
    ack_visto = ack_file.exists()

    while True:
        if res_file.exists():
            return True

        alvos = [res_file] if ack_visto else [res_file, ack_file]
        encontrado = await _esperar_algum(alvos, timeout=timeout)

        if encontrado is None:
            return res_file.exists()
        if encontrado == res_file:
            return True

        # Foi o ack: o job saiu da fila e começou. Zera o relógio uma vez.
        logger.info("[WorkerQueue] Job iniciou no worker (%s); relógio reiniciado.", ack_file.name)
        ack_visto = True


def _primeiro_existente(alvos: list[Path]) -> Path | None:
    """O primeiro alvo que já está no disco, ou None."""
    return next((alvo for alvo in alvos if alvo.exists()), None)


async def _esperar_algum(alvos: list[Path], *, timeout: int) -> Path | None:
    """Espera QUALQUER um de `alvos` aparecer; devolve qual, ou None no estouro.

    Todos os alvos vivem no mesmo diretório (a fila), então um watcher só
    cobre os dois. Cai para polling se o `watchfiles` não estiver disponível
    ou levantar qualquer erro.
    """
    presente = _primeiro_existente(alvos)
    if presente is not None:
        return presente

    try:
        from watchfiles import awatch  # type: ignore[import-not-found]
    except ImportError:
        return await _polling_existencia(alvos, timeout=timeout, intervalo=_POLL_INTERVAL_SEC)

    try:
        return await _watch_until_present(awatch, alvos, timeout=timeout)
    except TimeoutError:
        return _primeiro_existente(alvos)
    except Exception as e:
        logger.warning(
            "[WorkerQueue] Watcher falhou para %s, caindo para polling: %s",
            alvos[0].name,
            e,
        )
        return await _polling_existencia(alvos, timeout=timeout, intervalo=_POLL_INTERVAL_SEC)


async def _watch_until_present(awatch, alvos: list[Path], *, timeout: int) -> Path | None:
    """Itera eventos do `awatch` até um dos `alvos` aparecer ou o timeout
    expirar. Levanta `asyncio.TimeoutError` no estouro de tempo.

    `awatch` recebe APENAS o caminho — passar `timeout=...` é incorreto
    na API atual do `watchfiles` (≥ 0.x): o parâmetro existente
    (`rust_timeout`) controla o passo interno do polling Rust, não o
    timeout total da iteração. O timeout total é responsabilidade do
    `asyncio.timeout` envolvendo este método.
    """
    fila_dir = alvos[0].parent
    fila_dir.mkdir(parents=True, exist_ok=True)
    por_nome = {alvo.name: alvo for alvo in alvos}

    async with asyncio.timeout(timeout):
        async for changes in awatch(str(fila_dir)):
            for _change, raw_path in changes:
                alvo = por_nome.get(Path(raw_path).name)
                if alvo is not None:
                    return alvo
            # Defesa contra FS que perdem eventos (CIFS/SMB):
            # cada lote, releu o disco como sanity check.
            presente = _primeiro_existente(alvos)
            if presente is not None:
                return presente
    return _primeiro_existente(alvos)


async def _polling_existencia(alvos: list[Path], *, timeout: int, intervalo: float) -> Path | None:
    """Fallback puro: poll de existência até `timeout` ou algum alvo aparecer."""
    elapsed = 0.0
    while elapsed < timeout:
        presente = _primeiro_existente(alvos)
        if presente is not None:
            return presente
        await asyncio.sleep(intervalo)
        elapsed += intervalo
    return _primeiro_existente(alvos)
