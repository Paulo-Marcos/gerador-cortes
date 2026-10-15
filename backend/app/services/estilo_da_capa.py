"""Como a capa do TikTok se desenha: onde fica cada componente e em que estilo.

Separado da montagem (`capa_tiktok.py`), que cuida do texto, da arte e do
gerador: aqui só se decide o desenho (D-532, D-932, D-933).

O estilo salvo é POR CANAL e mora na mesma tabela do palco
(`palco_componentes_store`), numa linha própria (`capa_tiktok:<canal>`) — como
as escolhas de palco por escopo da D-923. O contrato está em
`domain/corte/estilo_da_capa.py`.
"""

from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

from app.core import channel_paths
from app.database import AsyncSessionLocal
from app.domain.canal.palco_componentes import FUNDOS
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte import capa_tiktok as geometria
from app.domain.corte import estilo_da_capa as dominio
from app.domain.corte.youtube_layout import FUNDO_PADRAO as FUNDO_DO_ATUAL
from app.infrastructure import palco_componentes_store
from app.models import Corte
from app.services import palco_componentes, palco_por_escopo
from app.services.app_settings import AppSettingsService

logger = logging.getLogger(__name__)


def ajuste_do_layout() -> dict:
    """Onde o operador pôs cada componente, das configurações globais (D-532).

    JSON inválido vira `{}` — a capa sai no padrão em vez de não sair. Config de
    posição não é motivo para uma capa falhar.
    """
    try:
        return json.loads(AppSettingsService.get().capa_tiktok_layout or "{}")
    except (ValueError, TypeError):
        logger.warning("[CapaTikTok] layout salvo nao e um JSON valido; usando o padrao")
        return {}


def estilo_do_palco(projeto_id: str, corte_id: str) -> dict[str, str]:
    """O estilo da capa é o do palco horizontal deste corte (D-932).

    A capa é a vitrine do perfil: num canal que trocou para o palco limpo, a
    capa no chrome antigo fazia a grade parecer de outro canal. Segue o palco
    EFETIVO do corte — canal, com a escolha do projeto e do corte por cima
    (D-923) —, o mesmo que o vídeo usa no render.
    """
    palco = palco_por_escopo.resolver(projeto_id, corte_id, "horizontal")["efetivo"]
    return {"estilo": palco.estilo, "fundoLimpo": palco.fundo}


def _db(db_path: Path | None) -> Path:
    return db_path if db_path is not None else channel_paths.settings_db_path()


def _chave() -> str:
    return f"capa_tiktok:{channel_paths.active_channel_root().name}"


def ler_salvo(*, db_path: Path | None = None) -> dict:
    """O estilo que o canal gravou (parcial), ou `{}` se nunca gravou."""
    banco = _db(db_path)
    if not banco.exists():
        return {}
    return dominio.normalizar(
        palco_componentes_store.ler_palco_componentes(banco, _chave()), FUNDOS
    )


def gravar(dados: dict, *, db_path: Path | None = None) -> dict:
    """Grava o estilo do canal — só o que chegou válido. `{}` volta tudo ao padrão."""
    limpo = dominio.validar(dados, FUNDOS)
    palco_componentes_store.gravar_palco_componentes(_db(db_path), _chave(), limpo)
    return limpo


def resolver_para_corte(
    projeto_id: str | None, corte_id: str | None, salvo: dict | None = None
) -> dominio.EstiloResolvido:
    """O estilo efetivo da capa deste corte; `salvo` troca o do canal (prévia)."""
    palco = estilo_do_palco(projeto_id or "", corte_id or "")
    return dominio.resolver(
        ler_salvo() if salvo is None else dominio.normalizar(salvo, FUNDOS),
        estilo_do_palco=palco["estilo"],
        fundo_do_palco=palco["fundoLimpo"],
        posicoes_globais=ajuste_do_layout(),
    )


async def corte_conferido(corte_id: str) -> tuple[str, str]:
    """O projeto e o id do corte COMO O BANCO OS TEM.

    O painel monta caminho de arquivo (a arte) a partir deles. Vindos da
    requisição, um `../` sairia da pasta de projetos; vindos do banco, são o
    que o app mesmo gravou.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
    if corte is None:
        raise NaoEncontrado("Corte nao encontrado.")
    return corte.projeto_id, corte.id


def painel(projeto_id: str, corte_id: str, arte: Path | None, rascunho: dict | None = None) -> dict:
    """Tudo que o modal de estilo precisa para desenhar a prévia (D-933).

    Com `rascunho`, o efetivo é o do rascunho — nada é gravado: é a prévia de
    quem ainda está arrastando. A geometria vem daqui, nunca é refeita na tela.
    """
    salvo = ler_salvo() if rascunho is None else dominio.normalizar(rascunho, FUNDOS)
    resolvido = resolver_para_corte(projeto_id, corte_id, salvo)
    return {
        "salvo": salvo,
        "efetivo": {
            "estilo": resolvido.estilo,
            "fundo": resolvido.fundo,
            "visiveis": resolvido.visiveis,
            "faixas": _no_vocabulario_do_editor(resolvido.layout),
        },
        "padrao": _no_vocabulario_do_editor(geometria.montar_layout(ajuste_do_layout())),
        "estilo_do_palco": estilo_do_palco(projeto_id, corte_id)["estilo"],
        "fundo_do_atual": FUNDO_DO_ATUAL,
        "arte": data_uri(arte) if arte else "",
        "cabecalho": _cabecalho(),
    }


def _no_vocabulario_do_editor(layout) -> dict[str, dict[str, int]]:
    """A geometria com `arte` no lugar de `frame`: o nome que o operador vê."""
    faixas = layout.como_dict()
    faixas["arte"] = faixas.pop("frame")
    return faixas


def props_da_capa(resolvido: dominio.EstiloResolvido) -> dict:
    """Os props de desenho do entry: estilo, visibilidade, faixas e cabeçalho."""
    return dominio.props_para_renderer(
        resolvido, _cabecalho() if resolvido.visiveis["cabecalho"] else {}
    )


def _cabecalho() -> dict[str, str]:
    """Nome, @ e imagem do canal — a mesma imagem do cabeçalho do palco."""
    from app.services.channels import identidade_do_canal_ativo

    canal = identidade_do_canal_ativo()
    handle = (canal.handle or "").strip()
    if handle and not handle.startswith("@"):
        handle = f"@{handle}"
    imagem = palco_componentes.imagem_para_servir(palco_componentes.ler_do_canal())
    return {
        "nome": canal.nome or "",
        "handle": handle,
        "imagem": data_uri(imagem) if imagem else "",
    }


def data_uri(imagem: Path) -> str:
    """Uma imagem embutida nos props.

    Copiá-la para `public/` do renderer invalidaria o fingerprint do bundle a
    cada corte (D-190), e o cache do Remotion pararia de acertar — cada capa
    custaria um bundle novo.
    """
    tipo = "png" if imagem.suffix.lower() == ".png" else "jpeg"
    dados = base64.b64encode(imagem.read_bytes()).decode("ascii")
    return f"data:image/{tipo};base64,{dados}"
