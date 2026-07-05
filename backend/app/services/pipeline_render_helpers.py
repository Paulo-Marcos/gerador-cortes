"""Helpers puros do pipeline de render: política de retry, execução com retry,
comando de render de overlay e fingerprint de assets servidos pelo bundle.

Extraído de `pipeline_render` (E-006). Sem I/O de worker/DB — apenas montagem
de comandos, retry (via `asyncio.sleep`) e varredura de `public/` do renderer.
"""

import asyncio
from pathlib import Path

from app.domain.overlay_codec import OverlayCodecProfile
from app.domain.retry_policy import RetryPolicy
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
) -> None:
    """Executa `operacao()` com retry segundo `policy`.

    `operacao` é uma callable que retorna uma coroutine — chamada de
    novo a cada tentativa (precisa ser fresh, não a mesma coroutine).
    """
    ultimo_erro: BaseException | None = None
    for attempt in range(1, policy.total_attempts + 1):
        try:
            await operacao()
            if attempt > 1:
                operational_info("Pipeline", f"* ✅ {rotulo}: sucesso na tentativa {attempt}")
            return
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
