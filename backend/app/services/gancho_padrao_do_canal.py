"""O gancho padrão do CANAL: o preset com que todo corte já nasce (D-901).

Até aqui o preset de gancho (D-594) era escolhido corte a corte, e o operador
escolhia o mesmo modelo toda vez. Agora há um degrau acima, como o layout
padrão do YouTube: o canal aponta um preset, e o corte que não escolheu o
próprio herda o do canal.

A cascata é PARCIAL (RN-10, RN-12): `Corte.gancho_padrao` vazio é a herança, e
o efetivo se resolve na LEITURA (`gancho_efetivo`). Nada é copiado para os cortes —
copiar mataria a herança: trocar o padrão do canal não mudaria os cortes já
feitos.
"""

from __future__ import annotations

from app.core import channel_paths
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.infrastructure import gancho_padrao_store
from app.models import LayoutPreset

# O tipo dos presets de gancho na tabela `layout_presets` (D-594). Mora aqui, e
# não no `palco_shorts`, porque lá ele importa este módulo.
TIPO_GANCHO = "gancho_short"


def _banco_e_canal():
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


def ler() -> str:
    """O id do preset padrão do canal ativo, ou "" quando o canal não tem."""
    return gancho_padrao_store.ler(*_banco_e_canal())


def gancho_efetivo(do_corte: str) -> str:
    """O preset que vale para o corte: o dele, ou o do canal quando ele não escolheu."""
    return do_corte or ler()


async def escolher(preset_id: str) -> dict:
    """Aponta o preset padrão do canal; "" tira o padrão."""
    if preset_id:
        async with AsyncSessionLocal() as db:
            preset = await db.get(LayoutPreset, preset_id)
        if not preset or preset.tipo != TIPO_GANCHO:
            raise NaoEncontrado(f"Preset de gancho {preset_id!r} não encontrado")
    gancho_padrao_store.gravar(*_banco_e_canal(), preset_id)
    return {"preset_id": preset_id}
