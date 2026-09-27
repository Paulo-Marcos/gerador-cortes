"""O estado da sincronização e o retrato da máquina saem inteiros pelo schema
(D-722)."""

import pytest
from app.routers.sincronizacao import AmbienteResponse, EstadoDaSincronizacao


def test_o_estado_da_sincronizacao_passa_inteiro_sem_git():
    # Sem git, os commits vêm vazios: não saber não é estar errado.
    estado = {
        "commit_rodando": "",
        "commit_disco": "",
        "backend_velho": False,
        "colunas_pendentes": [],
        "dependencias_faltando": [],
        "canal_em_uso": "seucanal",
        "canal_escolhido": "seucanal",
        "troca_de_canal_pendente": False,
        "em_dia": True,
    }

    assert EstadoDaSincronizacao.model_validate(estado).model_dump() == estado


@pytest.mark.parametrize("estado", ["ok", "aviso", "erro"])
def test_o_ambiente_passa_inteiro_em_cada_estado(estado):
    ambiente = {
        "pronto": estado != "erro",
        "itens": [
            {
                "id": "ffmpeg",
                "nome": "FFmpeg",
                "obrigatorio": True,
                "estado": estado,
                "detalhe": "",
                "como_resolver": "" if estado == "ok" else "Instale o FFmpeg.",
            }
        ],
    }

    assert AmbienteResponse.model_validate(ambiente).model_dump() == ambiente
