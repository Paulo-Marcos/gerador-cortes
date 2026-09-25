"""Helpers puros do pipeline de render: política de retry, execução com retry,
comando de render de overlay e fingerprint de assets servidos pelo bundle.

Extraído de `pipeline_render` (E-006). Sem I/O de worker/DB — apenas montagem
de comandos, retry (via `asyncio.sleep`) e varredura de `public/` do renderer.
"""

import asyncio
import hashlib
from pathlib import Path

from app.infrastructure.render.overlay_codec import OverlayCodecProfile
from app.infrastructure.render.remotion_bundle import _walk_source_files, compute_src_fingerprint
from app.infrastructure.render.retry_policy import RetryPolicy
from app.services.app_logging import operational_info


def _render_retry_policy(render_cfg) -> RetryPolicy:
    """Política a partir das settings: número de tentativas configurável,
    backoff fixo de 2s × attempt (suficiente para falhas transientes)."""
    return RetryPolicy(max_attempts=render_cfg.overlay_max_attempts, base_delay_sec=2.0)


async def _retry_async(
    *,
    operacao,
    policy: RetryPolicy,
    rotulo: str,
    nao_retentar: tuple[type[BaseException], ...] = (),
) -> None:
    """Executa `operacao()` com retry segundo `policy`.

    `operacao` é uma callable que retorna uma coroutine — chamada de
    novo a cada tentativa (precisa ser fresh, não a mesma coroutine).

    `nao_retentar` lista os erros que propagam na primeira ocorrência. Existe
    para o cancelamento (D-426): re-tentar o que o operador mandou parar
    ressuscitaria o trabalho três vezes antes de desistir.
    """
    ultimo_erro: BaseException | None = None
    for attempt in range(1, policy.total_attempts + 1):
        try:
            await operacao()
            if attempt > 1:
                operational_info("Pipeline", f"* ✅ {rotulo}: sucesso na tentativa {attempt}")
            return
        except nao_retentar:
            raise
        except Exception as e:
            ultimo_erro = e
            if not policy.should_retry(attempt):
                break
            delay = policy.backoff_seconds(attempt)
            operational_info(
                "Pipeline",
                f"* ⚠ {rotulo}: tentativa {attempt}/{policy.total_attempts} falhou ({type(e).__name__}). "
                f"Reagendando em {delay:.1f}s.",
            )
            if delay > 0:
                await asyncio.sleep(delay)

    if ultimo_erro is None:
        # Só chegamos aqui após esgotar as tentativas sem sucesso; ultimo_erro
        # sempre deveria estar preenchido. Um `assert` sumiria sob `python -O`.
        raise RuntimeError(f"{rotulo}: retentativas esgotadas sem erro registrado.")
    raise ultimo_erro


def _build_overlay_render_cmd(
    *,
    composition: str,
    bundle_arg: str,
    output_path: Path,
    props_file: Path,
    concurrency: int,
    codec_profile: OverlayCodecProfile,
) -> list[str]:
    """Comando `npx remotion render` para overlay transparente.

    A escolha de codec/pixel-format vem do `codec_profile` (VP9+alpha por
    padrão; ProRes 4444 disponível para casos especiais).
    """
    return [
        "npx",
        "remotion",
        "render",
        bundle_arg,
        composition,
        str(output_path.absolute()),
        "--props",
        str(props_file.absolute()),
        *codec_profile.remotion_args,
        "--gl=angle",
        "--log=warn",
        "--concurrency",
        str(concurrency),
        "--overwrite",
    ]


def _assets_servidos_do_bundle(renderer_dir: Path) -> list[Path]:
    """Assets materializados por canal que o `remotion bundle` EMBUTE no bundle.

    O bundle Remotion copia `video-renderer/public/` (mascote em `public/sapo/`) e
    embute o `theme.config.json` (importado por `theme-v2.ts`). Esses arquivos são
    re-materializados por canal (`channel_assets_sync`) e mudam SEM tocar em `src/`.
    Se ficassem de fora do fingerprint, trocar de canal / re-render de poses daria
    cache-hit num bundle com o `public/sapo` antigo e a maioria dos overlays do
    mascote sumiria (D-190). Incluí-los força o rebuild quando o mascote/tema muda.
    """
    assets: list[Path] = []
    public_dir = renderer_dir / "public"
    if public_dir.is_dir():
        assets.extend(p for p in public_dir.rglob("*") if p.is_file())
    theme_config = renderer_dir / "theme.config.json"
    if theme_config.is_file():
        assets.append(theme_config)
    return assets


# ─── Impressão digital do bundle (D-648) ─────────────────────────────────────
#
# Calcular o fingerprint relê 165 MB (src + public + theme) e custa 2,8s com o
# disco frio — a cada render, dentro do event loop, com o app congelado no meio.
#
# O truque é separar "mudou?" de "qual é o hash?". Descobrir se algo mudou custa
# 6ms (nome, tamanho e data de cada arquivo); o hash do CONTEÚDO só é refeito
# quando essa assinatura muda. O valor devolvido é idêntico ao de antes — é o
# mesmo cálculo, só não repetido à toa.

_fingerprint_em_cache: tuple[str, str] | None = None


def _extras_do_fingerprint(renderer_dir: Path) -> list[Path]:
    """Arquivos fora de `src/` que entram no fingerprint (ver D-190)."""
    return [
        renderer_dir / "package.json",
        # D-643: a versão que RODA está no lockfile, não no package.json. Um
        # `npm install` que resolve outro Remotion só muda este arquivo — sem
        # ele aqui, o bundle antigo seguia rodando com o CLI e o renderer novos.
        # Instalação sem lockfile continua valendo: arquivo ausente é pulado.
        renderer_dir / "package-lock.json",
        # remotion.config.ts controla o bundle (defines/DefinePlugin, ex.: o gate
        # do mascote em D-197). Fica na raiz, fora de src/, entao precisa entrar
        # no fingerprint senao editá-lo nao invalida o cache.
        renderer_dir / "remotion.config.ts",
        *_assets_servidos_do_bundle(renderer_dir),
    ]


def _assinatura_do_disco(renderer_dir: Path) -> str:
    """Retrato barato da árvore: caminho, tamanho e data de cada arquivo.

    Não abre arquivo nenhum. `st_mtime_ns` é nanossegundos: duas edições no
    mesmo segundo não se escondem atrás da granularidade do relógio.
    """
    hasher = hashlib.sha256()
    for relativo, caminho in _walk_source_files(renderer_dir / "src"):
        st = caminho.stat()
        hasher.update(f"src:{relativo}|{st.st_size}|{st.st_mtime_ns}\0".encode())
    for extra in sorted(_extras_do_fingerprint(renderer_dir)):
        if not extra.is_file():
            continue
        st = extra.stat()
        hasher.update(f"extra:{extra.name}|{st.st_size}|{st.st_mtime_ns}\0".encode())
    return hasher.hexdigest()


def fingerprint_do_bundle(renderer_dir: Path) -> str:
    """Fingerprint do bundle, reaproveitado enquanto o disco não muda.

    Síncrono de propósito: lê disco, então quem chama de uma corrotina usa
    `fingerprint_do_bundle_async`.
    """
    global _fingerprint_em_cache
    assinatura = _assinatura_do_disco(renderer_dir)
    if _fingerprint_em_cache and _fingerprint_em_cache[0] == assinatura:
        return _fingerprint_em_cache[1]

    fingerprint = compute_src_fingerprint(
        renderer_dir / "src", extra_files=_extras_do_fingerprint(renderer_dir)
    )
    _fingerprint_em_cache = (assinatura, fingerprint)
    return fingerprint


async def fingerprint_do_bundle_async(renderer_dir: Path) -> str:
    """Versão para o event loop: a leitura de disco roda em thread (D-645)."""
    return await asyncio.to_thread(fingerprint_do_bundle, renderer_dir)


def esquecer_fingerprint_em_cache() -> None:
    """Zera o cache (uso em teste)."""
    global _fingerprint_em_cache
    _fingerprint_em_cache = None
