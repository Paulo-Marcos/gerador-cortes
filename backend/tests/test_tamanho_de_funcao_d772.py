"""Nenhuma função Python fica complexa ou longa demais sem estar na lista de exceções (D-772).

Irmão do portão de tamanho de arquivo (D-771), com as mesmas regras de catraca.
Mede cada função de `backend/app` com duas regras do ruff:

- C901 (complexidade ciclomática, limite 10): quantos caminhos a função tem;
- PLR0915 (instruções, limite 40): quanto ela faz, sem contar docstring,
  comentário ou linha em branco.

As regras não entram no `select` do `pyproject.toml` de propósito: lá valeriam
para o arquivo inteiro, e as exceções teriam de ser por arquivo (uma função
nova num arquivo já listado passaria). Aqui a exceção é por função, com a
medida do dia 28/09/2026 como teto:

- função fora da lista que estoura um limite falha;
- função da lista que piora além do teto falha;
- função da lista que melhorou falha até o teto ser baixado — e sai da lista
  quando voltar ao limite.

A chave é `arquivo::Classe.funcao::regra`: renomear ou mover a função conta
como função nova.
"""

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration  # roda o ruff sobre o backend inteiro (D-751)

BACKEND = Path(__file__).resolve().parents[1]
LIMITES = {"C901": 10, "PLR0915": 40}

EXCECOES = {
    "app/domain/corte/ancora_match.py::ancorar_borda::C901": 11,
    "app/domain/corte/youtube_layout.py::_normalizar_regiao::C901": 12,
    "app/domain/corte/youtube_layout.py::regioes_compartilhadas::C901": 12,
    "app/domain/corte/youtube_layout.py::regioes_full_posicionadas::C901": 12,
    "app/domain/projeto/chunker.py::fatiar_transcricao::C901": 12,
    "app/infrastructure/render/ffmpeg_commands.py::build_cinematic_grade_cmd::C901": 12,
    "app/main.py::servir_video::C901": 17,
    "app/main.py::servir_video::PLR0915": 51,
    "app/routers/cortes_helpers.py::_corte_to_dict::C901": 12,
    "app/routers/cortes_helpers.py::_corte_to_dict::PLR0915": 47,
    "app/routers/metadados.py::atualizar_metadado::C901": 11,
    "app/routers/projetos.py::atualizar_render_config::C901": 11,
    "app/services/analise.py::AnaliseService.analisar_intervalo::PLR0915": 41,
    "app/services/analise.py::AnaliseService.montar_prompt_intervalo::C901": 11,
    "app/services/cenas_remotion.py::CenasRemotionService._preencher_retratos_cenas::C901": 16,
    "app/services/cenas_remotion.py::CenasRemotionService._preencher_retratos_cenas::PLR0915": 48,
    "app/services/cenas_remotion.py::CenasRemotionService.gerar_cenas::PLR0915": 45,
    "app/services/corte.py::CorteService.detectar_silencios_tecnico::C901": 13,
    "app/services/corte.py::CorteService.detectar_silencios_tecnico::PLR0915": 64,
    "app/services/export_processamento.py::_ExportProcessamentoMixin._adicionar_intro_outro::PLR0915": 41,
    "app/services/export_processamento.py::_ExportProcessamentoMixin.processar_multiversion::C901": 11,
    "app/services/export_processamento.py::_ExportProcessamentoMixin.processar_multiversion::PLR0915": 50,
    "app/services/ingestao.py::IngestaoService._baixar_video::C901": 13,
    "app/services/ingestao.py::IngestaoService._baixar_video::PLR0915": 45,
    "app/services/ingestao.py::IngestaoService._extrair_legenda::C901": 15,
    "app/services/ingestao.py::IngestaoService._extrair_legenda::PLR0915": 61,
    "app/services/instagram_reels.py::executar_roteiro::PLR0915": 45,
    "app/services/lives_do_canal.py::listar_lives::C901": 11,
    "app/services/lives_do_canal.py::listar_lives::PLR0915": 42,
    "app/services/metadados.py::MetadadosService.importar_resultado_meta::PLR0915": 42,
    "app/services/render/finalizacao_do_corte.py::_limpar_pasta_corte_pos_sync::C901": 12,
    "app/services/render/pipeline_render.py::_fase_overlays::PLR0915": 41,
    "app/services/tiktok_studio.py::executar_roteiro::PLR0915": 43,
    "app/services/timeline_math.py::TimelineMath.recalcular_transcricao::C901": 12,
    "app/services/timeline_math.py::TimelineMath.recalcular_transcricao::PLR0915": 43,
    "app/services/youtube.py::YouTubeService.upload_video._run_upload::C901": 14,
    "app/services/youtube.py::YouTubeService.upload_video._run_upload::PLR0915": 59,
    "app/services/youtube.py::YouTubeService.upload_video::C901": 39,
    "app/services/youtube.py::YouTubeService.upload_video::PLR0915": 140,
}


def _nome_qualificado(arvore: ast.Module, linha: int) -> str:
    pais = {filho: pai for pai in ast.walk(arvore) for filho in ast.iter_child_nodes(pai)}
    for no in ast.walk(arvore):
        if not isinstance(no, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if no.lineno != linha and all(d.lineno != linha for d in no.decorator_list):
            continue
        nomes, atual = [], no
        while atual in pais:
            if isinstance(atual, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                nomes.append(atual.name)
            atual = pais[atual]
        return ".".join(reversed(nomes))
    raise LookupError(f"nenhuma função começa na linha {linha}")


def _medir_funcoes() -> dict[str, int]:
    saida = subprocess.run(
        [
            sys.executable,
            "-m",
            "ruff",
            "check",
            "app",
            "--select",
            ",".join(LIMITES),
            "--config",
            f"lint.mccabe.max-complexity={LIMITES['C901']}",
            "--config",
            f"lint.pylint.max-statements={LIMITES['PLR0915']}",
            "--output-format",
            "json",
            "--no-cache",
            "--exit-zero",
        ],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=120,
    ).stdout
    arvores: dict[str, ast.Module] = {}
    medidas = {}
    for violacao in json.loads(saida):
        caminho = Path(violacao["filename"]).resolve().relative_to(BACKEND).as_posix()
        if caminho not in arvores:
            arvores[caminho] = ast.parse((BACKEND / caminho).read_text(encoding="utf-8"))
        funcao = _nome_qualificado(arvores[caminho], violacao["location"]["row"])
        medida = int(re.search(r"\((\d+) > \d+\)", violacao["message"]).group(1))
        medidas[f"{caminho}::{funcao}::{violacao['code']}"] = medida
    return medidas


@pytest.fixture(scope="module")
def medidas() -> dict[str, int]:
    return _medir_funcoes()


def test_funcao_nova_nao_estoura_limite(medidas):
    novas = {chave: valor for chave, valor in medidas.items() if chave not in EXCECOES}
    assert not novas, (
        f"Funções acima do limite {LIMITES} (divida a função; não a acrescente a EXCECOES): {novas}"
    )


def test_excecao_nao_piora(medidas):
    pioraram = {
        chave: f"{medidas[chave]} > teto {teto}"
        for chave, teto in EXCECOES.items()
        if medidas.get(chave, 0) > teto
    }
    assert not pioraram, f"Funções da lista de exceções pioraram: {pioraram}"


def test_lista_de_excecoes_so_diminui(medidas):
    desatualizadas = {}
    for chave, teto in EXCECOES.items():
        atual = medidas.get(chave)
        if atual is None:
            desatualizadas[chave] = "voltou ao limite, mudou de nome ou sumiu: remova da lista"
        elif atual < teto:
            desatualizadas[chave] = f"melhorou para {atual}: baixe o teto"
    assert not desatualizadas, f"Atualize EXCECOES: {desatualizadas}"
