"""Wrapper sobre o CLI do Google Antigravity (`agy -p`) — o provider "Gemini".

Espelha `claude_cli_client`: gera texto/JSON delegando a um subprocess do binário
OFICIAL `agy`, com o prompt pela entrada padrão. WHY CLI e não a API do Gemini:
usa o login Google e a cota da assinatura do Antigravity, sem API key — o mesmo
papel que o `claude -p` cumpre para a assinatura do Claude.

Protocolo medido em 15/09/2026 (agy 1.2.3):
- `-p=` + `--input-format stream-json` + `--output-format stream-json`: o prompt
  segue como UMA mensagem NDJSON no stdin. O argv do Windows corta em ~32k chars,
  e a análise da live passa de 200k (um prompt de 203k chars foi aceito).
- A resposta é NDJSON; o evento `result` traz `status`, `response`,
  `duration_seconds` e `usage` (`input_tokens`/`output_tokens`).
- Cada chamada gasta ~37k tokens fixos da cota (prompt de sistema do agente)
  antes do nosso conteúdo. Não serve para chamadas minúsculas e frequentes.
- O `-p` nega as ferramentas que pedem aprovação — por isso NUNCA passar
  `--dangerously-skip-permissions`. Roda numa pasta vazia para o agente não
  enxergar o repositório.

Termos do Antigravity: usar o OAuth dele em ferramenta de terceiros dá banimento.
Aqui só executamos o binário oficial; nunca extrair token nem falar direto com
o backend do Google.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from app.config import settings
from app.core.por_loop import PorLoop
from app.infrastructure import claude_cli_client, fila_ia
from app.infrastructure.claude_cli_client import LlmCallContext

# Depois de matar a árvore, quanto esperar o pipe do processo morto fechar.
_ESPERA_PARA_DRENAR_S = 15
# Listar os modelos é uma consulta curta ao CLI.
_TIMEOUT_DA_LISTA_DE_MODELOS_S = 60

logger = logging.getLogger(__name__)


class AntigravityCliError(RuntimeError):
    """Falha ao invocar o `agy`. `transient=True` marca falhas que valem retry."""

    def __init__(self, message: str, *, transient: bool = False):
        super().__init__(message)
        self.transient = transient


# Variáveis que desviariam o `agy` da assinatura para a API paga do Gemini. É a
# mesma armadilha que o Claude já teve com ANTHROPIC_API_KEY: a chave existe no
# ambiente por outro motivo (aqui, a geração de imagem da capa) e vaza para o CLI.
_ENV_FORCA_API = (
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_USE_VERTEXAI",
    "GOOGLE_CLOUD_PROJECT",
)

_MSG_LOGIN = (
    "O Antigravity CLI não está logado nesta máquina. Abra um terminal, rode `agy` "
    "uma vez e entre com a conta Google da assinatura."
)

# Folga do timeout do processo sobre o `--print-timeout`: o `agy` deve estourar
# primeiro e explicar o motivo no evento `result`, antes de o matarmos às cegas.
_FOLGA_PROCESSO_SEG = 30.0


def _resolver_binario() -> str:
    """Caminho do `agy`: override por settings, PATH, ou o local do instalador."""
    if settings.agy_cli_path:
        return settings.agy_cli_path
    encontrado = shutil.which("agy")
    if encontrado:
        return encontrado
    # O instalador grava no PATH do USUÁRIO; um backend aberto antes da
    # instalação herda o PATH antigo e não acharia o binário.
    padrao = Path(os.environ.get("LOCALAPPDATA", "")) / "agy" / "bin" / "agy.exe"
    if padrao.is_file():
        return str(padrao)
    raise AntigravityCliError(
        "Binário 'agy' não encontrado. Instale o Antigravity CLI ou defina AGY_CLI_PATH no .env."
    )


def _montar_argv(model: str, timeout: float) -> list[str]:
    """Só flags no argv — o conteúdo do prompt vai inteiro pelo stdin."""
    return [
        _resolver_binario(),
        "-p=",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--model",
        model,
        "--disable-slash-commands",
        "--print-timeout",
        f"{int(timeout)}s",
    ]


def _mensagem_stdin(prompt: str) -> bytes:
    mensagem = {"event": "user", "message": {"content": prompt}}
    return (json.dumps(mensagem, ensure_ascii=False) + "\n").encode("utf-8")


def _subprocess_env() -> dict[str, str]:
    return {k: v for k, v in os.environ.items() if k not in _ENV_FORCA_API}


def _cwd() -> str:
    pasta = Path(tempfile.gettempdir()) / "cortador-agy"
    pasta.mkdir(exist_ok=True)
    return str(pasta)


def _evento_result(stdout: str) -> dict | None:
    """O payload do último evento `result` do NDJSON, ou None se não houver."""
    resultado = None
    for linha in stdout.splitlines():
        try:
            evento = json.loads(linha)
        except json.JSONDecodeError:
            continue
        if isinstance(evento, dict) and evento.get("event") == "result":
            resultado = evento.get("result")
    return resultado if isinstance(resultado, dict) else None


def _pede_login(texto: str) -> bool:
    return "authentication required" in (texto or "").lower()


def _run_sync(prompt: str, *, model: str, timeout: float) -> dict:
    """Executa o `agy -p` (bloqueante) e devolve o payload do evento `result`.

    Bloqueante e numa thread pelo mesmo motivo do `claude_cli_client`: o event
    loop do uvicorn no Windows não suporta subprocess assíncrono.
    """
    logger.info(
        "[AgyCLI] iniciando modelo=%s prompt=%d chars timeout=%ss", model, len(prompt), timeout
    )
    proc = subprocess.Popen(
        _montar_argv(model, timeout),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=_cwd(),
        env=_subprocess_env(),
    )
    try:
        stdout_b, stderr_b = proc.communicate(
            input=_mensagem_stdin(prompt), timeout=timeout + _FOLGA_PROCESSO_SEG
        )
    except subprocess.TimeoutExpired as exc:
        claude_cli_client._matar_arvore(proc)
        try:
            proc.communicate(timeout=_ESPERA_PARA_DRENAR_S)
        except Exception:  # noqa: BLE001 — só drena o pipe do processo morto
            pass
        raise AntigravityCliError(f"Antigravity CLI excedeu o timeout de {timeout}s.") from exc

    stdout = stdout_b.decode("utf-8", errors="replace")
    stderr = stderr_b.decode("utf-8", errors="replace").strip()
    resultado = _evento_result(stdout)

    if resultado is None:
        if _pede_login(stderr) or _pede_login(stdout):
            raise AntigravityCliError(_MSG_LOGIN)
        raise AntigravityCliError(
            f"Antigravity CLI saiu com código {proc.returncode} sem resultado. "
            f"stderr: {stderr[:500] or '<vazio>'}",
            transient=True,
        )

    status = resultado.get("status")
    if status != "SUCCESS":
        erro = str(resultado.get("error") or stderr or "")
        if _pede_login(erro):
            raise AntigravityCliError(_MSG_LOGIN)
        raise AntigravityCliError(
            f"Antigravity CLI terminou com status {status}: {erro[:300]}",
            transient=status == "ERROR",
        )

    logger.info(
        "[AgyCLI] ok (%.1fs, tokens in=%s out=%s)",
        float(resultado.get("duration_seconds") or 0.0),
        (resultado.get("usage") or {}).get("input_tokens"),
        (resultado.get("usage") or {}).get("output_tokens"),
    )
    return resultado


# Um semáforo por event loop, como o gate do Claude (D-700).
_semaforos: PorLoop[asyncio.Semaphore] = PorLoop(
    lambda: asyncio.Semaphore(max(1, settings.agy_cli_max_concurrent))
)


def _semaforo() -> asyncio.Semaphore:
    return _semaforos.obter()


async def _run(prompt: str, *, model: str, timeout: float) -> dict:
    tentativas = max(1, settings.agy_cli_retries + 1)
    for tentativa in range(tentativas):
        try:
            async with _semaforo():
                return await asyncio.to_thread(_run_sync, prompt, model=model, timeout=timeout)
        except AntigravityCliError as exc:
            if not exc.transient or tentativa == tentativas - 1:
                raise
            espera = claude_cli_client._backoff(tentativa)
            logger.warning(
                "[AgyCLI] erro transitório (tentativa %d/%d): %s — retry em %.0fs",
                tentativa + 1,
                tentativas,
                exc,
                espera,
            )
            await asyncio.sleep(espera)
    raise AssertionError("inalcançável: o loop sempre retorna ou levanta")  # pragma: no cover


def _envelope_telemetria(resultado: dict) -> dict:
    """Traduz o `result` do agy para o formato que a telemetria do Claude lê."""
    duracao = resultado.get("duration_seconds")
    return {
        "usage": resultado.get("usage"),
        "duration_ms": float(duracao) * 1000.0 if duracao is not None else None,
        # A assinatura não cobra por chamada; o custo em dólar não se aplica.
        "total_cost_usd": None,
    }


async def generate_text(
    prompt: str,
    *,
    model: str,
    expertise: str | None = None,
    timeout: float | None = None,
    contexto: LlmCallContext | None = None,
) -> str:
    """Gera texto livre. `expertise` (corpo da skill) vai à frente do prompt."""
    entrada = f"{expertise}\n\n{prompt}" if expertise else prompt
    etapa = contexto.etapa if contexto else None
    projeto_id = contexto.projeto_id if contexto else None
    corte_id = contexto.corte_id if contexto else None
    limite = claude_cli_client._timeout_para_prompt(
        entrada, timeout if timeout is not None else settings.agy_cli_timeout
    )

    inicio = time.perf_counter()
    chave_fila = fila_ia.anunciar_inicio(etapa, projeto_id=projeto_id, corte_id=corte_id)
    try:
        resultado = await _run(entrada, model=model, timeout=limite)
    except AntigravityCliError as exc:
        claude_cli_client._registrar_telemetria(
            prompt=entrada,
            resposta="",
            model=model,
            skill=None,
            contexto=contexto,
            envelope=None,
            latencia_ms=(time.perf_counter() - inicio) * 1000.0,
            sucesso=False,
            erro_tipo=type(exc).__name__,
        )
        fila_ia.anunciar_fim(chave_fila, sucesso=False, erro=fila_ia.mensagem_de(exc))
        raise
    except BaseException as exc:
        fila_ia.anunciar_fim(chave_fila, sucesso=False, erro=fila_ia.mensagem_de(exc))
        raise

    texto = str(resultado.get("response") or "").strip()
    claude_cli_client._registrar_telemetria(
        prompt=entrada,
        resposta=texto,
        model=model,
        skill=None,
        contexto=contexto,
        envelope=_envelope_telemetria(resultado),
        latencia_ms=(time.perf_counter() - inicio) * 1000.0,
        sucesso=True,
        erro_tipo=None,
    )
    fila_ia.anunciar_fim(chave_fila, sucesso=True)
    return texto


async def generate_json(
    prompt: str,
    *,
    model: str,
    expertise: str | None = None,
    timeout: float | None = None,
    contexto: LlmCallContext | None = None,
) -> dict:
    """Gera JSON; tolera a resposta embrulhada em ```json (o modelo costuma fazer)."""
    texto = await generate_text(
        prompt, model=model, expertise=expertise, timeout=timeout, contexto=contexto
    )
    try:
        return claude_cli_client._extract_json(texto)
    except Exception as exc:
        # A chamada deu certo, mas o resultado é inútil: a fila mostra como falha.
        fila_ia.anunciar_fim(
            fila_ia.chave(
                contexto.etapa if contexto else None,
                projeto_id=contexto.projeto_id if contexto else None,
                corte_id=contexto.corte_id if contexto else None,
            ),
            sucesso=False,
            erro=fila_ia.mensagem_de(exc),
        )
        raise


def listar_modelos() -> list[tuple[str, str]]:
    """Os modelos que o `agy` desta máquina oferece, como (id, nome).

    Lista vazia quando o CLI não está instalado ou logado: a tela de skills
    continua aceitando o id digitado à mão.
    """
    try:
        proc = subprocess.run(
            [_resolver_binario(), "models"],
            capture_output=True,
            timeout=_TIMEOUT_DA_LISTA_DE_MODELOS_S,
            env=_subprocess_env(),
            cwd=_cwd(),
            check=False,
        )
    except (AntigravityCliError, OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("[AgyCLI] não foi possível listar os modelos: %s", exc)
        return []
    if proc.returncode != 0:
        return []
    modelos: list[tuple[str, str]] = []
    for linha in proc.stdout.decode("utf-8", errors="replace").splitlines():
        partes = linha.strip().split(maxsplit=1)
        if partes:
            modelos.append((partes[0], partes[1].strip() if len(partes) > 1 else partes[0]))
    return modelos
