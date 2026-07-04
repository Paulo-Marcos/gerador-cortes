"""Regressão D-177 / D-185: `config.py` não pode declarar a identidade de um canal.

A identidade do canal (handle/nome/crédito/`youtube_channel_id`) é lida do
`channel.yaml` do canal ativo via `channels.identidade_do_canal_ativo()`
(implementado em D-173). Nenhum consumidor lê mais esses campos de `settings`, e o
seed de boot usa `os.getenv` direto — logo eles não têm razão de existir em
`config.py`. Este teste trava a AUSÊNCIA desses campos em `Settings`: reintroduzir
qualquer um deles (mesmo com default vazio) volta a criar uma fonte concorrente de
identidade e quebra o build.
"""

from __future__ import annotations

from app.config import Settings

CAMPOS_DE_IDENTIDADE = ("youtube_channel_id", "canal_handle", "canal_nome", "canal_credito")


def test_identidade_do_canal_nao_existe_em_config():
    for campo in CAMPOS_DE_IDENTIDADE:
        assert campo not in Settings.model_fields, (
            f"config.py.{campo} não pode ser declarado: identidade e canal-fonte "
            f"vêm do channel.yaml do canal ativo (via channels.identidade_do_canal_ativo). "
            f"Remova o campo de Settings."
        )
