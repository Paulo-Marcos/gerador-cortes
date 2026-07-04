"""Testes do registry de canais (D-153).

Cobrem o caminho feliz e as bordas do serviço `services/channels.py`: listar com
marcação do ativo, criar a partir do template, selecionar (grava ponteiro,
exige restart) e editar a identidade preservando `config_version`. Tudo isolado
por `tmp_path` — nenhum teste toca o `instance/` real do repositório.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from app.services import channels as svc

EXEMPLO_YAML = """config_version: 1
handle: "@seucanal"
nome: "Seu Canal"
credito: "@seucanal"
youtube_channel_id: "@fonte-lives"
paleta:
  primaria: "#1a1a2e"
  secundaria: "#16213e"
  acento: "#0f3460"
"""


@pytest.fixture()
def instancia(tmp_path: Path) -> tuple[Path, Path]:
    """Cria uma instância isolada com 1 canal ('default') ativo + um template."""
    instance_root = tmp_path / "instance"
    canal = instance_root / "channels" / "default"
    canal.mkdir(parents=True)
    (canal / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")
    (instance_root / "active-channel").write_text("default\n", encoding="utf-8")

    exemplo = tmp_path / "examples" / "instance.example"
    (exemplo / "editorial").mkdir(parents=True)
    (exemplo / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")
    (exemplo / "editorial" / "cortes.md").write_text("# guia\n", encoding="utf-8")
    (exemplo / "README.md").write_text("template\n", encoding="utf-8")
    return instance_root, exemplo


def test_listar_marca_o_ativo(instancia):
    instance_root, _ = instancia
    canais = svc.listar_canais(instance_root)
    assert [c.id for c in canais] == ["default"]
    assert canais[0].ativo is True
    assert canais[0].handle == "@seucanal"
    assert canais[0].paleta.acento == "#0f3460"


def test_listar_sem_channels_dir_e_vazio(tmp_path: Path):
    assert svc.listar_canais(tmp_path / "instance") == []


def test_criar_canal_a_partir_do_template(instancia):
    instance_root, exemplo = instancia
    canal = svc.criar_canal(
        "novo-canal",
        identidade={"nome": "Novo", "paleta": {"acento": "#abcabc"}},
        instance_root=instance_root,
        exemplo_dir=exemplo,
    )
    assert canal.id == "novo-canal"
    assert canal.nome == "Novo"
    assert canal.paleta.acento == "#abcabc"
    assert canal.ativo is False  # criar não muda o ativo

    destino = instance_root / "channels" / "novo-canal"
    assert (destino / "editorial" / "cortes.md").is_file()
    assert not (destino / "README.md").exists()  # README do template é descartado
    # Identidade não informada herda o template; config_version preservado.
    dados = yaml.safe_load((destino / "channel.yaml").read_text(encoding="utf-8"))
    assert dados["config_version"] == 1
    assert dados["handle"] == "@seucanal"

    # Não tocou no ponteiro de ativo.
    assert (instance_root / "active-channel").read_text(encoding="utf-8").strip() == "default"


def test_criar_canal_id_duplicado_falha(instancia):
    instance_root, exemplo = instancia
    with pytest.raises(svc.CanalJaExiste):
        svc.criar_canal("default", instance_root=instance_root, exemplo_dir=exemplo)


@pytest.mark.parametrize("ruim", ["", "Maiusc", "com espaco", "-comeca-hifen", "acentução"])
def test_criar_canal_id_invalido_falha(instancia, ruim):
    instance_root, exemplo = instancia
    with pytest.raises(svc.IdCanalInvalido):
        svc.criar_canal(ruim, instance_root=instance_root, exemplo_dir=exemplo)


def test_selecionar_grava_ponteiro_e_exige_restart(instancia):
    instance_root, exemplo = instancia
    svc.criar_canal("outro", instance_root=instance_root, exemplo_dir=exemplo)

    resultado = svc.selecionar_canal("outro", instance_root=instance_root)
    assert resultado.canal_id == "outro"
    assert resultado.requer_restart is True
    assert (instance_root / "active-channel").read_text(encoding="utf-8").strip() == "outro"

    # Agora 'outro' é quem aparece como ativo na listagem.
    ativos = [c.id for c in svc.listar_canais(instance_root) if c.ativo]
    assert ativos == ["outro"]


def test_selecionar_inexistente_falha(instancia):
    instance_root, _ = instancia
    with pytest.raises(svc.CanalNaoEncontrado):
        svc.selecionar_canal("fantasma", instance_root=instance_root)


def test_editar_identidade_preserva_config_version(instancia):
    instance_root, _ = instancia
    canal = svc.editar_identidade(
        "default",
        {"nome": "Canal Editado", "paleta": {"primaria": "#111111"}},
        instance_root=instance_root,
    )
    assert canal.nome == "Canal Editado"
    assert canal.paleta.primaria == "#111111"
    # Campos não tocados permanecem.
    assert canal.handle == "@seucanal"
    assert canal.paleta.acento == "#0f3460"

    dados = yaml.safe_load(
        (instance_root / "channels" / "default" / "channel.yaml").read_text(encoding="utf-8")
    )
    assert dados["config_version"] == 1


def test_editar_inexistente_falha(instancia):
    instance_root, _ = instancia
    with pytest.raises(svc.CanalNaoEncontrado):
        svc.editar_identidade("fantasma", {"nome": "x"}, instance_root=instance_root)


# --------------------------------------------------------------------------- #
# Accessor de identidade do canal ativo (D-173) + seed no boot
# --------------------------------------------------------------------------- #

from app import channel_layout_migration as migr  # noqa: E402


def test_identidade_do_canal_ativo_devolve_os_quatro_campos(instancia, monkeypatch):
    instance_root, _ = instancia
    canal_root = instance_root / "channels" / "default"
    monkeypatch.setattr(svc, "active_channel_root", lambda: canal_root)

    canal = svc.identidade_do_canal_ativo()
    assert canal.handle == "@seucanal"
    assert canal.nome == "Seu Canal"
    assert canal.credito == "@seucanal"
    assert canal.youtube_channel_id == "@fonte-lives"


def test_seed_preenche_campos_vazios_a_partir_do_ambiente(tmp_path: Path, monkeypatch):
    canal_root = tmp_path / "channels" / "default"
    canal_root.mkdir(parents=True)
    (canal_root / "channel.yaml").write_text("config_version: 1\n", encoding="utf-8")

    monkeypatch.setenv("CANAL_HANDLE", "@meucanal")
    monkeypatch.setenv("CANAL_NOME", "Meu Canal")
    monkeypatch.setenv("CANAL_CREDITO", "@credito")
    monkeypatch.setenv("YOUTUBE_CHANNEL_ID", "UC12345")

    migr._semear_identidade_do_ambiente(canal_root)

    dados = yaml.safe_load((canal_root / "channel.yaml").read_text(encoding="utf-8"))
    assert dados["handle"] == "@meucanal"
    assert dados["nome"] == "Meu Canal"
    assert dados["credito"] == "@credito"
    assert dados["youtube_channel_id"] == "UC12345"
    assert dados["config_version"] == 1  # campos preexistentes preservados


def test_seed_nao_sobrescreve_campo_ja_preenchido(tmp_path: Path, monkeypatch):
    canal_root = tmp_path / "channels" / "default"
    canal_root.mkdir(parents=True)
    (canal_root / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")

    monkeypatch.setenv("CANAL_HANDLE", "@nao-deve-entrar")
    monkeypatch.setenv("YOUTUBE_CHANNEL_ID", "UC-nao-deve-entrar")

    migr._semear_identidade_do_ambiente(canal_root)

    dados = yaml.safe_load((canal_root / "channel.yaml").read_text(encoding="utf-8"))
    assert dados["handle"] == "@seucanal"  # valor original preservado
    assert dados["youtube_channel_id"] == "@fonte-lives"


# --------------------------------------------------------------------------- #
# Seed do nome do MASCOTE a partir do ambiente (D-264)
# --------------------------------------------------------------------------- #
# O accessor que consome o arquivo é `editorial_identity.identidade_do_mascote()`
# (lido em `editorial/mascote.yaml`); aqui garantimos que o seed de boot o cria a
# partir de `CANAL_MASCOTE_NOME`, com a mesma disciplina do seed de identidade.


def test_seed_mascote_cria_yaml_a_partir_do_ambiente(tmp_path: Path, monkeypatch):
    canal_root = tmp_path / "channels" / "default"
    (canal_root / "editorial").mkdir(parents=True)
    monkeypatch.setenv("CANAL_MASCOTE_NOME", "Sapo")

    migr._semear_mascote_do_ambiente(canal_root)

    dados = yaml.safe_load(
        (canal_root / "editorial" / "mascote.yaml").read_text(encoding="utf-8")
    )
    assert dados["nome"] == "Sapo"
    assert dados["config_version"] == 1


def test_seed_mascote_noop_sem_env(tmp_path: Path, monkeypatch):
    canal_root = tmp_path / "channels" / "default"
    (canal_root / "editorial").mkdir(parents=True)
    monkeypatch.delenv("CANAL_MASCOTE_NOME", raising=False)

    migr._semear_mascote_do_ambiente(canal_root)

    # Sem env: nada é escrito — o canal segue no fallback neutro do accessor.
    assert not (canal_root / "editorial" / "mascote.yaml").exists()


def test_seed_mascote_nao_sobrescreve_nome_existente(tmp_path: Path, monkeypatch):
    canal_root = tmp_path / "channels" / "default"
    editorial = canal_root / "editorial"
    editorial.mkdir(parents=True)
    (editorial / "mascote.yaml").write_text(
        'config_version: 1\nnome: "Coruja"\n', encoding="utf-8"
    )
    monkeypatch.setenv("CANAL_MASCOTE_NOME", "Sapo")

    migr._semear_mascote_do_ambiente(canal_root)

    dados = yaml.safe_load((editorial / "mascote.yaml").read_text(encoding="utf-8"))
    assert dados["nome"] == "Coruja"  # valor já presente é preservado
