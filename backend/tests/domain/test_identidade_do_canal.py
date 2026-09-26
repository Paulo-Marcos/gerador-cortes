"""As regras da identidade do Canal, no domínio (D-762).

Moravam em `services/channels.py` misturadas com o YAML e o ponteiro do canal
ativo, e só eram testadas de passagem, através do disco. Aqui são testadas como
regras: o id de canal é um slug, e editar a identidade só muda o que veio.
"""

import pytest
from app.domain.canal.identidade import (
    IdCanalInvalido,
    id_de_canal_valido,
    mesclar_identidade,
)
from app.domain.compartilhado.erros import PedidoInvalido


@pytest.mark.parametrize("bom", ["meu-canal", "c1", "9canal", "  com-espaco-nas-pontas  "])
def test_id_de_canal_e_um_slug(bom):
    assert id_de_canal_valido(bom) == bom.strip()


@pytest.mark.parametrize(
    "ruim", ["", "   ", "Maiuscula", "-comeca-com-hifen", "tem espaco", "acentuação", None]
)
def test_id_fora_do_slug_e_recusado_como_pedido_invalido(ruim):
    with pytest.raises(IdCanalInvalido) as exc:
        id_de_canal_valido(ruim)

    assert isinstance(exc.value, PedidoInvalido)


def test_editar_so_muda_o_que_veio_e_guarda_o_que_nao_e_identidade():
    atual = {"handle": "@antes", "nome": "Antes", "config_version": 3}

    novo = mesclar_identidade(atual, {"nome": "Depois", "handle": None, "inventado": "x"})

    assert novo == {"handle": "@antes", "nome": "Depois", "config_version": 3}
    assert atual == {"handle": "@antes", "nome": "Antes", "config_version": 3}


def test_a_paleta_funde_campo_a_campo():
    atual = {"paleta": {"primaria": "#111111", "acento": "#333333"}}

    novo = mesclar_identidade(atual, {"paleta": {"acento": "#ff0000", "secundaria": None}})

    assert novo["paleta"] == {"primaria": "#111111", "acento": "#ff0000"}
    assert atual["paleta"] == {"primaria": "#111111", "acento": "#333333"}


def test_paleta_gravada_torta_recomeca_do_zero():
    novo = mesclar_identidade({"paleta": "lixo"}, {"paleta": {"primaria": "#000000"}})

    assert novo["paleta"] == {"primaria": "#000000"}


def test_valores_viram_texto():
    assert mesclar_identidade({}, {"youtube_channel_id": 123}) == {"youtube_channel_id": "123"}
