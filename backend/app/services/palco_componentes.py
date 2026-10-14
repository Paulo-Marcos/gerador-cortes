"""Os componentes do palco por canal: onde são guardados e como chegam ao render (D-911).

O contrato (estilo, cabeçalho, placa) mora em `domain/canal/palco_componentes.py`.
Aqui ficam as três costuras com o mundo:

  - o `settings.db` (uma linha JSON por canal, `palco_componentes_store`);
  - a imagem do cabeçalho: subida para `<canal>/assets/palco/` e espelhada em
    `video-renderer/public/palco/`, que é de onde o `staticFile` do Remotion lê;
  - o cache de PNG do palco, que é apagado a cada edição.

## Por que a edição apaga o cache em vez de entrar na chave

A chave do PNG do horizontal (`palco_cache_key`, no domínio do layout) é a do
LAYOUT DO CORTE, e o FFmpeg resolve o arquivo por ela sem passar por aqui. Pôr o
canal na chave obrigaria todo leitor da chave a conhecer este serviço. Apagar os
PNGs ao gravar é mais simples e tem o mesmo efeito: o próximo render regenera com
os componentes novos, e nenhum render usa um palco de antes da edição.
"""

from __future__ import annotations

import io
import json
import logging
from pathlib import Path
from typing import Any

from app.core import channel_paths
from app.domain.canal import palco_componentes as dominio
from app.domain.canal import palco_do_escopo
from app.domain.canal.palco_componentes import PalcoComponentes
from app.domain.compartilhado.erros import PedidoInvalido
from app.infrastructure import channel_assets_sync, palco_componentes_store
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)

# O arquivo da imagem do cabeçalho dentro de `assets/palco/` (a extensão vem do
# upload). Um nome fixo: trocar a imagem substitui, nunca acumula.
NOME_DA_IMAGEM = "cabecalho"
# Um logo ou avatar cabe folgado; acima disso é engano (um vídeo, uma foto crua).
TAMANHO_MAXIMO_DA_IMAGEM = 10 * 1024 * 1024

# Subpasta do `public/` do renderer onde a imagem é servida (`staticFile`).
SUBPASTA_SERVIDA = "palco"


def _db(db_path: Path | None) -> Path:
    return db_path if db_path is not None else channel_paths.settings_db_path()


def _canal(channel_id: str | None) -> str:
    return channel_id if channel_id is not None else channel_paths.active_channel_root().name


def ler(*, db_path: Path | None = None, channel_id: str | None = None) -> PalcoComponentes:
    """Os componentes do canal — com a escolha do corte em render por cima (D-923)."""
    escolha = channel_paths.PALCO_DO_CORTE_NO_RENDER.get()
    canal = ler_do_canal(db_path=db_path, channel_id=channel_id)
    return palco_do_escopo.aplicar(canal, *json.loads(escolha)) if escolha else canal


def ler_do_canal(*, db_path: Path | None = None, channel_id: str | None = None) -> PalcoComponentes:
    """Os componentes do canal, ou o padrão do domínio se ele nunca editou."""
    banco = _db(db_path)
    if not banco.exists():
        return dominio.PADRAO
    return dominio.normalizar(
        palco_componentes_store.ler_palco_componentes(banco, _canal(channel_id))
    )


def gravar(
    mudancas: dict[str, Any],
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    cache_dir: Path | None = None,
) -> PalcoComponentes:
    """Funde a edição com o que estava gravado, persiste e invalida o cache do palco."""
    novo = dominio.mesclar(ler_do_canal(db_path=db_path, channel_id=channel_id), mudancas)
    palco_componentes_store.gravar_palco_componentes(
        _db(db_path), _canal(channel_id), novo.para_dict()
    )
    apagados = invalidar_cache_do_palco(cache_dir)
    logger.info(
        "[Palco] componentes gravados para %s; %d PNG(s) de cache apagados",
        _canal(channel_id),
        apagados,
    )
    return novo


def invalidar_cache_do_palco(cache_dir: Path | None = None) -> int:
    """Apaga os PNGs do palco em cache; devolve quantos saíram."""
    pasta = cache_dir if cache_dir is not None else channel_paths.palco_cache_dir()
    if not pasta.is_dir():
        return 0
    apagados = 0
    # D-923: e as pastas de cada escolha de estilo de projeto/corte (`escopo-*`)
    for png in [*pasta.glob("*.png"), *pasta.glob("escopo-*/*.png")]:
        try:
            png.unlink()
            apagados += 1
        except OSError:  # um PNG em uso por um render em voo fica; o próximo save o pega
            logger.warning("[Palco] nao consegui apagar %s do cache", png.name)
    return apagados


# --------------------------------------------------------------------------- #
# A imagem do cabeçalho
# --------------------------------------------------------------------------- #


def salvar_imagem(
    conteudo: bytes,
    content_type: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    assets_dir: Path | None = None,
    renderer_public: Path | None = None,
    cache_dir: Path | None = None,
) -> PalcoComponentes:
    """Guarda a imagem subida pelo operador e aponta o cabeçalho para ela."""
    extensao = dominio.extensao_da_imagem(content_type)
    _exigir_imagem_de_verdade(conteudo)
    pasta = assets_dir if assets_dir is not None else channel_paths.palco_assets_dir()
    pasta.mkdir(parents=True, exist_ok=True)
    _apagar_imagens_antigas(pasta)
    arquivo = pasta / f"{NOME_DA_IMAGEM}{extensao}"
    arquivo.write_bytes(conteudo)
    materializar_imagem_servida(assets_dir=pasta, renderer_public=renderer_public)
    return gravar(
        {"cabecalho": {"imagem": arquivo.name}},
        db_path=db_path,
        channel_id=channel_id,
        cache_dir=cache_dir,
    )


def remover_imagem(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    assets_dir: Path | None = None,
    renderer_public: Path | None = None,
    cache_dir: Path | None = None,
) -> PalcoComponentes:
    """Volta o cabeçalho para a pose padrão do mascote e apaga a imagem subida."""
    pasta = assets_dir if assets_dir is not None else channel_paths.palco_assets_dir()
    _apagar_imagens_antigas(pasta)
    servida = (
        renderer_public if renderer_public is not None else _renderer_public()
    ) / SUBPASTA_SERVIDA
    _apagar_imagens_antigas(servida)
    return gravar(
        {"cabecalho": {"imagem": ""}}, db_path=db_path, channel_id=channel_id, cache_dir=cache_dir
    )


def _exigir_imagem_de_verdade(conteudo: bytes) -> None:
    """Recusa o que não abre como imagem: o content-type é só o que o cliente DIZ.

    Um arquivo qualquer gravado como `cabecalho.png` passaria aqui e quebraria
    o rasterizador do palco no próximo render, longe de quem o subiu.
    """
    if not conteudo:
        raise PedidoInvalido("A imagem do cabeçalho veio vazia.")
    if len(conteudo) > TAMANHO_MAXIMO_DA_IMAGEM:
        raise PedidoInvalido("A imagem do cabeçalho passa de 10 MB; use um arquivo menor.")
    try:
        with Image.open(io.BytesIO(conteudo)) as imagem:
            imagem.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as erro:
        raise PedidoInvalido("O arquivo enviado não é uma imagem válida.") from erro


def _apagar_imagens_antigas(pasta: Path) -> None:
    if not pasta.is_dir():
        return
    for antiga in pasta.glob(f"{NOME_DA_IMAGEM}.*"):
        antiga.unlink(missing_ok=True)


def _renderer_public() -> Path:
    return channel_assets_sync.RENDERER_PUBLIC


def materializar_imagem_servida(
    *, assets_dir: Path | None = None, renderer_public: Path | None = None
) -> list[Path]:
    """Espelha `assets/palco/` no `public/palco/` do renderer (idempotente)."""
    pasta = assets_dir if assets_dir is not None else channel_paths.palco_assets_dir()
    destino = (
        renderer_public if renderer_public is not None else _renderer_public()
    ) / SUBPASTA_SERVIDA
    return channel_assets_sync.garantir_palco_materializado(pasta, renderer_palco=destino)


def imagem_do_operador(
    componentes: PalcoComponentes, *, assets_dir: Path | None = None
) -> Path | None:
    """O arquivo que o operador subiu, se o cabeçalho aponta para um que existe."""
    nome = componentes.cabecalho.imagem
    if not nome:
        return None
    pasta = assets_dir if assets_dir is not None else channel_paths.palco_assets_dir()
    caminho = pasta / Path(nome).name
    return caminho if caminho.is_file() else None


def imagem_padrao(mascote_dir: Path | None = None) -> Path | None:
    """A pose do mascote que o cabeçalho usa sem imagem própria, ou None sem PNG nenhum."""
    pasta = mascote_dir if mascote_dir is not None else channel_paths.mascot_pngs_dir()
    if not pasta.is_dir():
        return None
    preferida = pasta / f"{dominio.POSE_PADRAO_DO_CABECALHO}.png"
    if preferida.is_file():
        return preferida
    return next(iter(sorted(pasta.glob("*.png"))), None)


def imagem_para_servir(
    componentes: PalcoComponentes,
    *,
    assets_dir: Path | None = None,
    mascote_dir: Path | None = None,
) -> Path | None:
    """O arquivo que a tela mostra ao lado do @: o do operador, senão o mascote."""
    return imagem_do_operador(componentes, assets_dir=assets_dir) or imagem_padrao(mascote_dir)


def imagem_servida_relativa(
    componentes: PalcoComponentes,
    *,
    assets_dir: Path | None = None,
    mascote_dir: Path | None = None,
) -> str:
    """O caminho que o rasterizador passa ao `staticFile`, relativo ao `public/`.

    A imagem do operador vive em `public/palco/`; a pose do mascote, em
    `public/mascote/` (materializada pelo `channel_assets_sync`). Vazio quando não
    há imagem nenhuma: o cabeçalho sai só com o texto.
    """
    propria = imagem_do_operador(componentes, assets_dir=assets_dir)
    if propria is not None:
        return f"{SUBPASTA_SERVIDA}/{propria.name}"
    padrao = imagem_padrao(mascote_dir)
    if padrao is not None:
        return f"mascote/{padrao.name}"
    return ""


# --------------------------------------------------------------------------- #
# O que vai para o rasterizador do palco
# --------------------------------------------------------------------------- #


def props_para_palco(
    *, db_path: Path | None = None, channel_id: str | None = None
) -> dict[str, Any]:
    """Os componentes resolvidos para o PNG do palco (horizontal e short).

    Nunca levanta: o palco é gerado no meio do render, e uma identidade que não
    carregou não pode custar o vídeo. Nesse caso os textos saem vazios, e fica o
    aviso no log.
    """
    componentes = ler(db_path=db_path, channel_id=channel_id)
    nome, handle = _identidade_do_canal()
    return dominio.props_para_renderer(
        componentes,
        nome_do_canal=nome,
        handle_do_canal=handle,
        imagem_servida=imagem_servida_relativa(componentes),
    )


def _identidade_do_canal() -> tuple[str, str]:
    from app.services import channels

    try:
        canal = channels.identidade_do_canal_ativo()
    except Exception:  # noqa: BLE001 — identidade ausente não derruba o render
        logger.warning("[Palco] identidade do canal indisponivel; cabecalho sai sem textos")
        return "", ""
    return canal.nome, canal.handle
