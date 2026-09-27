"""D-725: a cena que o backend grava cabe no contrato de quem a renderiza.

A cena tem uma definição só: o schema zod do renderer. O backend não fala zod
e lê o mesmo contrato em JSON Schema, gerado dele e guardado no protocolo
(video-renderer/protocol/cena.schema.json). Um teste do frontend recusa o
arquivo quando ele fica para trás do zod; este confere o lado do backend.
"""

import json
from pathlib import Path

import pytest
from app.services.cenas_remotion import (
    CAMPOS_DO_MASCOTE_NA_CENA,
    CAMPOS_SIMPLES_DA_CENA,
    LISTAS_DA_CENA,
    _converter_cena,
)

from tests.json_schema_minimo import violacoes

_CONTRATO = json.loads(
    (
        Path(__file__).resolve().parents[2] / "video-renderer" / "protocol" / "cena.schema.json"
    ).read_text(encoding="utf-8")
)
_PROPRIEDADES = _CONTRATO["properties"]

# Gravados e nunca renderizados: estão em 97% das 5.009 cenas de PROD (medido em
# 27/09/2026), e o zod do renderer os descarta em silêncio. Ficam nomeados aqui
# para que um campo NOVO fora do contrato não passe despercebido junto com eles.
_GRAVADOS_SEM_RENDER = {"ancoraLegendas", "motivo"}


def _sem_os_gravados_sem_render(cena: dict) -> dict:
    return {chave: valor for chave, valor in cena.items() if chave not in _GRAVADOS_SEM_RENDER}


def test_todo_campo_que_o_backend_grava_existe_no_contrato():
    gravados = set(CAMPOS_SIMPLES_DA_CENA) | set(CAMPOS_DO_MASCOTE_NA_CENA) | set(LISTAS_DA_CENA)
    fora = gravados - set(_PROPRIEDADES) - _GRAVADOS_SEM_RENDER
    assert not fora, f"o backend grava campos que o renderer não conhece: {sorted(fora)}"


def test_os_campos_gravados_sem_render_continuam_fora_do_contrato():
    # Se o renderer passar a ler um deles, ele sai da lista de exceções.
    assert not _GRAVADOS_SEM_RENDER & set(_PROPRIEDADES)


@pytest.mark.parametrize("tipo", _PROPRIEDADES["tipo"]["enum"])
def test_a_cena_convertida_de_cada_tipo_cabe_no_contrato(tipo):
    resposta_da_ia = {
        "tipo": tipo,
        "duracao_s": 4,
        "texto": "O que a tela mostra",
        "subtexto": "Linha de apoio",
        "numero": "1 em 1 milhão",
        "autor": "Friedrich Nietzsche",
        "fonte": "Stanford Encyclopedia",
        "sapoMood": "pensativo",
        "mascotPosicao": "tr",
        "textura": "papel",
        "marcos": [{"data": "1789", "titulo": "Revolução"}],
        "itens": [{"titulo": "Primeiro ponto", "detalhe": "e o porquê"}],
        "motivo": "a IA explica a escolha",
    }

    cena = _converter_cena(resposta_da_ia, inicio_seg=12.5)

    assert violacoes(_sem_os_gravados_sem_render(cena), _CONTRATO, "cena") == []


def test_os_padroes_que_o_backend_aplica_estao_no_contrato():
    cena = _converter_cena({"tipo": "enfase", "texto": "x"}, inicio_seg=0)

    for campo in ("layout_card", "sombra_nivel", "modelo_cena"):
        assert cena[campo] in _PROPRIEDADES[campo]["enum"], campo
