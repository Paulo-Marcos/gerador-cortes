"""Wrapper thin sobre o Claude Code CLI (`claude -p`).

Gera texto/JSON delegando a um subprocess assíncrono do binário `claude`,
no mesmo padrão de I/O usado para ffmpeg/yt-dlp. Espelha a interface de
`gemini_client` (generate_json / generate_text) para encaixar nas costuras
`montar_prompt*` / `importar_*` que já existem nos serviços.

WHY CLI e não API: usa a assinatura local do Claude (sem API key, sem custo
por token). Limite consciente: o binário `claude` não existe no container
Docker — este provider só funciona no fluxo LOCAL (dev.ps1 / backend nativo).

Envelope retornado por `--output-format json` (campos usados):
    {"is_error": bool, "result": "<texto do modelo>", "total_cost_usd": float,
     "duration_ms": int, ...}
O `result` pode vir embrulhado em ```json ... ``` — `_extract_json` resolve.
"""

import asyncio
import json
import logging
import os
import random
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.channel_paths import editorial_dir
from app.config import settings

logger = logging.getLogger(__name__)

# D-144: cada skill editorial pode ter o seu corpo SOBRESCRITO por um arquivo em
# `instance/editorial/` (fonte editorial única, gitignored). Quando o arquivo
# existe, o conteúdo dele vira a expertise injetada no prompt e a skill nativa de
# `.claude/skills/` deixa de ser ativada. Quando NÃO existe, mantém-se exatamente
# o comportamento atual (ativação nativa via `/<skill>`) — fallback não-destrutivo.
# Os templates GENÉRICOS versionados ficam em `examples/instance.example/editorial/`.
_EDITORIAL_POR_SKILL = {
    "cortador-expert": "cortes.md",
    "trechos-expert": "trechos.md",
    "cenas-expert": "cenas.md",
    "metadados-expert": "metadados.md",
    "thumbnail-prompt-expert": "thumbnail.md",
}


def _dir_editorial() -> Path:
    """Diretório da fonte editorial da instância.

    Resolvido pela raiz do canal ativo (`channel_paths.editorial_dir`) — costura
    única do épico Multi-canal. Hoje aponta para `<repo>/instance/editorial`, a
    mesma raiz onde o CLI descobre `.claude/skills` (ver `_cwd(skill_mode=True)`),
    então override e fallback continuam compartilhando o ponto de ancoragem.
    """
    return editorial_dir()


def _carregar_editorial_override(skill: str | None) -> str | None:
    """Corpo editorial de `instance/editorial/<arquivo>.md` para a skill, ou None.

    None quando a skill não é editorial, o arquivo não existe ou está vazio —
    casos em que o caller cai no fallback da skill nativa.
    """
    arquivo = _EDITORIAL_POR_SKILL.get(skill or "")
    if not arquivo:
        return None
    caminho = _dir_editorial() / arquivo
    if not caminho.is_file():
        return None
    corpo = caminho.read_text(encoding="utf-8").strip()
    return corpo or None


class ClaudeCliError(RuntimeError):
    """Falha ao invocar o Claude CLI.

    `transient=True` marca falhas que valem retry (overload, limite de
    concorrência, error_during_execution) — vs. erros de config (não-retryable).
    """

    def __init__(self, message: str, *, transient: bool = False):
        super().__init__(message)
        self.transient = transient


# Semáforo por event-loop: limita chamadas `claude -p` simultâneas (evita estourar
# o limite de concorrência da assinatura). Lazy e por-loop para não vazar entre
# loops diferentes (ex.: vários asyncio.run em testes).
_semaphores: dict[int, asyncio.Semaphore] = {}


def _get_semaphore() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    sem = _semaphores.get(id(loop))
    if sem is None:
        sem = asyncio.Semaphore(max(1, settings.claude_cli_max_concurrent))
        _semaphores[id(loop)] = sem
    return sem


def _resolver_binario() -> str:
    """Resolve o caminho do binário `claude`. Override por settings ou PATH."""
    if settings.claude_cli_path:
        return settings.claude_cli_path
    encontrado = shutil.which("claude")
    if not encontrado:
        raise ClaudeCliError(
            "Binário 'claude' não encontrado no PATH. Instale o Claude Code "
            "ou defina CLAUDE_CLI_PATH no .env. (Provider Claude só roda local.)"
        )
    return encontrado


def _montar_argv(model: str, max_turns: int) -> list[str]:
    """Monta o argv do subprocess.

    No Windows o binário resolvido costuma ser `claude.cmd`, que o CreateProcess
    não executa direto — por isso delegamos a `cmd /c claude ...`. Em POSIX
    invocamos o binário diretamente. Nada de conteúdo do usuário vai no argv
    (só flags): o prompt inteiro segue via stdin, evitando limites e quoting.
    """
    flags = [
        "-p",
        "--output-format",
        "json",
        "--model",
        model,
        "--max-turns",
        str(max_turns),
        # WHY --tools "": geração é single-shot puro. Sem isso o modelo pode
        # tentar usar uma ferramenta (turno extra) e estourar o max-turns →
        # subtype "error_during_execution". Sem ferramentas, responde direto.
        "--tools",
        "",
        # WHY --strict-mcp-config: rodando na raiz do projeto (skill_mode), o CLI
        # tentaria subir servidores MCP do ambiente, que penduram em modo -p.
        # Não usamos MCP na geração → ignora todos e evita travas de minutos.
        "--strict-mcp-config",
    ]
    if os.name == "nt":
        return ["cmd", "/c", "claude", *flags]
    return [_resolver_binario(), *flags]


def _cwd(skill_mode: bool) -> str:
    """cwd da invocação.

    skill_mode=True → raiz do projeto, para o `/skill` ser DESCOBERTO em
    `.claude/skills`. Senão → temp (não herda o CLAUDE.md do projeto).
    """
    if skill_mode:
        # skills_dir = <proj>/.claude/skills → sobe 2 níveis = raiz do projeto.
        return os.path.dirname(os.path.dirname(settings.skills_dir))
    return settings.claude_cli_cwd or tempfile.gettempdir()


# Variáveis de ambiente que FORÇAM o CLI ao modo API (cobrança por crédito) ou a
# um provedor externo, em vez da assinatura local. Podem estar presentes por
# outros motivos (ex.: o setup do ai-memory exporta ANTHROPIC_BASE_URL) e
# VAZARIAM para o `claude -p` via os.environ — fazendo a geração cobrar de uma
# conta de API (sintoma: "Credit balance is too low"). Removidas do subprocess
# para garantir o uso da assinatura local (ver docstring do módulo).
_ENV_FORCA_API = (
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_CUSTOM_HEADERS",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
)


def _subprocess_env(thinking: int) -> dict[str, str]:
    """Env do `claude -p`: herda o ambiente mas REMOVE as variáveis que forçam o
    modo API/provedor externo, garantindo autenticação pela assinatura local.
    """
    env = {k: v for k, v in os.environ.items() if k not in _ENV_FORCA_API}
    env["MAX_THINKING_TOKENS"] = str(thinking)
    return env


def _matar_arvore(proc: "subprocess.Popen") -> None:
    """Mata a ÁRVORE de processos do `claude -p`.

    WHY: no Windows usamos `cmd /c claude` → cmd spawna `claude` → `node`. Matar
    só o `cmd` (proc.kill) deixa os netos vivos segurando o pipe de stdout, o que
    trava o `communicate` de limpeza e faz o timeout NUNCA voltar de verdade
    (sintoma: 'rodando' por 10-15 min). `taskkill /T` derruba a árvore inteira.
    """
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        proc.kill()


def _run_sync(
    prompt: str,
    *,
    model: str,
    max_turns: int,
    timeout: float,
    skill_mode: bool = False,
    thinking_tokens: int | None = None,
) -> dict:
    """Executa `claude -p` (bloqueante) com o prompt via stdin → envelope JSON.

    WHY subprocess.run e não asyncio.create_subprocess_exec: no Windows o event
    loop do uvicorn é o SelectorEventLoop, que NÃO suporta subprocess assíncrono
    (NotImplementedError). Rodamos bloqueante e delegamos a uma thread via
    asyncio.to_thread em `_run` — mesmo padrão do gemini_client.
    """
    argv = _montar_argv(model, max_turns)
    # Por padrão 0 (desligado) — extended thinking faz geração com muitas
    # restrições raciocinar por minutos. `thinking_tokens` liga por chamada
    # quando a QUALIDADE compensa a latência (ex.: prompt de thumbnail).
    thinking = (
        thinking_tokens if thinking_tokens is not None else settings.claude_cli_max_thinking_tokens
    )
    logger.info(
        "[ClaudeCLI] iniciando modelo=%s skill_mode=%s prompt=%d chars timeout=%ss thinking=%s",
        model,
        skill_mode,
        len(prompt),
        timeout,
        thinking,
    )

    proc = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=_cwd(skill_mode),
        env=_subprocess_env(thinking),
    )
    try:
        stdout_b, stderr_b = proc.communicate(input=prompt.encode("utf-8"), timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        # Mata a árvore (cmd→claude→node) — senão o timeout não retorna de fato.
        _matar_arvore(proc)
        try:
            proc.communicate(timeout=15)  # reap; agora o pipe fecha
        except Exception:  # noqa: BLE001
            pass
        raise ClaudeCliError(
            f"Claude CLI excedeu o timeout de {timeout}s.", transient=False
        ) from exc

    stdout = stdout_b.decode("utf-8", errors="replace").strip()
    stderr = stderr_b.decode("utf-8", errors="replace").strip()

    # O envelope JSON é emitido no stdout quando o TURNO termina; só DEPOIS o CLI
    # roda os hooks de fim de sessão (SessionEnd do plugin codex, ai-memory...).
    # Um hook que estoura seu timeout vira "Hook cancelled" e FAZ o `claude -p`
    # sair com código != 0 — mesmo com o resultado já pronto e válido no stdout.
    # Logo o ENVELOPE, não o exit code, é a fonte de verdade do sucesso da geração.
    envelope = _try_parse_envelope(stdout)

    if envelope is not None and not envelope.get("is_error"):
        if proc.returncode != 0:
            # Geração ok; o exit != 0 veio de um hook de ciclo de vida pós-sessão.
            logger.warning(
                "[ClaudeCLI] exit=%s com envelope de sucesso — ignorando exit code "
                "(hook de sessão cancelado?). stderr: %s",
                proc.returncode,
                stderr[:200] or "<vazio>",
            )
        logger.info(
            "[ClaudeCLI] ok (duration_ms=%s, custo ~$%.4f)",
            envelope.get("duration_ms"),
            envelope.get("total_cost_usd") or 0.0,
        )
        return envelope

    # Sem resultado utilizável. Diagnóstico mais específico primeiro: erro do
    # modelo (envelope is_error, ex.: 401/overload) > exit code != 0 > não-JSON.
    if envelope is not None and envelope.get("is_error"):
        subtype = envelope.get("subtype", "?")
        # is_error costuma ser transitório (overload/concorrência/error_during_execution).
        raise ClaudeCliError(
            f"Claude CLI erro (subtype={subtype}): {str(envelope.get('result'))[:300]}",
            transient=True,
        )

    if proc.returncode != 0:
        raise ClaudeCliError(
            f"Claude CLI saiu com código {proc.returncode}. stderr: {stderr[:500] or '<vazio>'}",
            transient=True,
        )

    raise ClaudeCliError(f"Resposta do Claude CLI não é JSON: {stdout[:300]}", transient=True)


# Backoff exponencial (com jitter) entre tentativas em erro transitório. Pensado
# sobretudo para o 529 Overloaded da Anthropic: sobrecarga server-side que cede
# esperando um pouco mais a cada tentativa. Backoff linear curto (2s/4s) muitas
# vezes não atravessa o pico; exponencial dá tempo de o servidor respirar.
_BACKOFF_BASE = 2.0  # segundos
_BACKOFF_MAX = 30.0  # teto por espera


def _backoff(tentativa: int) -> float:
    """Espera antes da próxima tentativa: base * 2**tentativa, com teto e jitter.

    O jitter (0..base) evita que chamadas concorrentes sincronizem os retries e
    batam todas no mesmo instante num servidor já sobrecarregado.
    """
    espera = min(_BACKOFF_MAX, _BACKOFF_BASE * (2**tentativa))
    return espera + random.uniform(0.0, _BACKOFF_BASE)


async def _run(
    prompt: str,
    *,
    model: str,
    max_turns: int,
    timeout: float,
    skill_mode: bool = False,
    thinking_tokens: int | None = None,
) -> dict:
    """Wrapper async: roda o subprocess bloqueante numa thread (compatível com o
    SelectorEventLoop do uvicorn no Windows), limitando concorrência via semáforo
    e fazendo retry com backoff exponencial em erros transitórios (overload/529).
    """
    if not settings.claude_cli_enabled:
        raise ClaudeCliError("Provider Claude desabilitado (CLAUDE_CLI_ENABLED=false).")

    tentativas = max(1, settings.claude_cli_retries + 1)
    ultimo_erro: ClaudeCliError | None = None
    for tentativa in range(tentativas):
        try:
            async with _get_semaphore():
                return await asyncio.to_thread(
                    _run_sync,
                    prompt,
                    model=model,
                    max_turns=max_turns,
                    timeout=timeout,
                    skill_mode=skill_mode,
                    thinking_tokens=thinking_tokens,
                )
        except ClaudeCliError as exc:
            ultimo_erro = exc
            if not exc.transient or tentativa == tentativas - 1:
                raise
            espera = _backoff(tentativa)
            logger.warning(
                "[ClaudeCLI] erro transitório (tentativa %d/%d): %s — retry em %.0fs",
                tentativa + 1,
                tentativas,
                exc,
                espera,
            )
            await asyncio.sleep(espera)
    raise ultimo_erro  # pragma: no cover — loop sempre retorna ou levanta antes


def _try_parse_envelope(stdout: str) -> dict | None:
    """Parseia o 1º objeto JSON do stdout (`--output-format json`), ou None.

    Não levanta: o chamador decide o que fazer quando não há envelope, pois um
    stdout sem JSON pode ser falha real OU apenas ruído acompanhando um exit code
    != 0 vindo de hook de sessão. `raw_decode` ignora 'Extra data' após o objeto —
    o CLI às vezes emite linhas adicionais (ruído, stream) depois do envelope.
    """
    texto = stdout.lstrip()
    if not texto:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(texto)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        inicio = texto.find("{")
        if inicio != -1:
            try:
                obj, _ = json.JSONDecoder().raw_decode(texto[inicio:])
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                pass
    return None


async def generate_text(
    prompt: str,
    *,
    model: str = "sonnet",
    skill: str | None = None,
    max_turns: int = 1,
    timeout: float | None = None,
    thinking_tokens: int | None = None,
) -> str:
    """Gera texto livre. Retorna o conteúdo bruto do modelo (campo `result`).

    skill: nome de uma skill em `.claude/skills/`. Quando informado, a skill é
    ATIVADA nativamente (`/<skill>` na 1ª linha, rodando na raiz do projeto) —
    não enviamos o corpo do SKILL.md; o Claude o carrega do disco.

    D-144: se a skill tiver um override em `instance/editorial/` (fonte editorial
    única), o corpo de lá é INJETADO no prompt e a skill nativa NÃO é ativada —
    o conteúdo passa a ser resolvido pelo loader, não fixo em `.claude/skills/`.

    thinking_tokens: liga o extended thinking (MAX_THINKING_TOKENS) só nesta
    chamada. Default None = herda o global (`claude_cli_max_thinking_tokens`).
    """
    override = _carregar_editorial_override(skill)
    if override is not None:
        # Expertise veio do loader (instance/editorial/) → injeta no prompt e roda
        # fora do skill_mode (não ativa a skill nativa nem herda o CLAUDE.md).
        entrada = f"{override}\n\n{prompt}"
        skill_mode = False
    else:
        entrada = f"/{skill}\n\n{prompt}" if skill else prompt
        skill_mode = skill is not None
    envelope = await _run(
        entrada,
        model=model,
        max_turns=max_turns,
        timeout=timeout if timeout is not None else settings.claude_cli_timeout,
        skill_mode=skill_mode,
        thinking_tokens=thinking_tokens,
    )
    return str(envelope.get("result", "")).strip()


async def generate_json(
    prompt: str,
    *,
    model: str = "sonnet",
    skill: str | None = None,
    max_turns: int = 1,
    timeout: float | None = None,
    thinking_tokens: int | None = None,
) -> dict:
    """Gera JSON. Instrua o formato no prompt; extrai mesmo com markdown fences.

    Exemplo:
        >>> data = await generate_json("Gere {\"ok\": true} em JSON", model="haiku")
    """
    texto = await generate_text(
        prompt,
        model=model,
        skill=skill,
        max_turns=max_turns,
        timeout=timeout,
        thinking_tokens=thinking_tokens,
    )
    return _extract_json(texto)


def _extract_json(text: str) -> dict:
    """Extrai JSON de uma resposta que pode conter markdown fences ou texto extra.

    Mesma estratégia do gemini_client._extract_json (consistência de contrato).
    """
    json_match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if json_match:
        return _parse_objeto_json(json_match.group(1).strip())

    inicio = _find_first(text, "{", "[")
    fim = _find_last(text, "}", "]")
    if inicio != -1 and fim != -1 and fim > inicio:
        return _parse_objeto_json(text[inicio : fim + 1])

    return _parse_objeto_json(text)


def _parse_objeto_json(bruto: str) -> dict:
    """Faz o parse e garante que o topo é um objeto JSON (dict).

    A IA às vezes devolve um array válido (ex.: `[{...}]`); sem esta guarda o
    chamador quebraria adiante com `KeyError`. Falhar aqui, na fronteira, dá um
    erro claro em vez de um estouro obscuro rio abaixo.
    """
    resultado = json.loads(bruto)
    if not isinstance(resultado, dict):
        raise ValueError(f"Resposta JSON não é um objeto: recebido {type(resultado).__name__}.")
    return resultado


def _find_first(text: str, *chars: str) -> int:
    posicoes = [pos for c in chars if (pos := text.find(c)) != -1]
    return min(posicoes) if posicoes else -1


def _find_last(text: str, *chars: str) -> int:
    posicoes = [pos for c in chars if (pos := text.rfind(c)) != -1]
    return max(posicoes) if posicoes else -1
