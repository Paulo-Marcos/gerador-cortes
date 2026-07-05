"""D-151: migrador de layout `instance/` plano → `channels/<ativo>/` no boot.

Exercita as invariantes que sustentam o "copiar o prod LOSSLESS":

  - LOSSLESS: todo item do layout plano vai para dentro do canal SEM perda
    (mesmos caminhos relativos, mesmos checksums; nada sobra no nível raiz);
  - IDEMPOTENTE: rodar de novo é NO-OP — não move nada nem levanta erro;
  - INSTALAÇÃO NOVA: sem `instance/`, materializa o canal default do exemplo;
  - DEFENSIVO: destino conflitante ou layout ambíguo → aborta sem sobrescrever;
  - resolução do canal ativo em `channel_paths.active_channel_root`.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from app import channel_paths
from app.channel_layout_migration import (
    LayoutMigrationError,
    garantir_layout_de_canais,
)

# --------------------------------------------------------------------------- #
# Fixtures auxiliares
# --------------------------------------------------------------------------- #


def _criar_instance_plano(raiz: Path, handle: str = "@meucanal") -> dict[str, str]:
    """Monta um `instance/` plano realista e devolve checksums por caminho relativo."""
    raiz.mkdir(parents=True, exist_ok=True)
    (raiz / "channel.yaml").write_text(
        f'config_version: 1\nhandle: "{handle}"\nnome: "Meu Canal"\n', encoding="utf-8"
    )
    (raiz / "editorial").mkdir()
    (raiz / "editorial" / "cortes.md").write_text("# cortes\nregra editorial\n", encoding="utf-8")
    (raiz / "editorial" / "canal_config.py").write_text(
        "CREDITOS_TEMPLATE = 'x'\n", encoding="utf-8"
    )
    (raiz / "mascot").mkdir()
    (raiz / "mascot" / "poses.json").write_text('{"feliz": "a.png"}', encoding="utf-8")
    (raiz / "projetos").mkdir()
    (raiz / "projetos" / "abc").mkdir()
    (raiz / "projetos" / "abc" / "video.txt").write_text("conteudo do projeto", encoding="utf-8")
    (raiz / "projetos.db").write_bytes(b"SQLite format 3\x00dados-binarios")
    return _checksums(raiz)


def _checksums(raiz: Path) -> dict[str, str]:
    """Mapa {caminho-relativo: sha256} de todos os ARQUIVOS sob `raiz`."""
    saida: dict[str, str] = {}
    for arquivo in sorted(raiz.rglob("*")):
        if arquivo.is_file():
            rel = arquivo.relative_to(raiz).as_posix()
            saida[rel] = hashlib.sha256(arquivo.read_bytes()).hexdigest()
    return saida


def _criar_exemplo(raiz: Path) -> None:
    """Semente mínima equivalente a examples/instance.example/."""
    raiz.mkdir(parents=True, exist_ok=True)
    (raiz / "channel.yaml").write_text('handle: "@seucanal"\nnome: "Seu Canal"\n', encoding="utf-8")
    (raiz / "editorial").mkdir()
    (raiz / "editorial" / ".gitkeep").write_text("", encoding="utf-8")
    (raiz / "mascot").mkdir()
    (raiz / "mascot" / ".gitkeep").write_text("", encoding="utf-8")


# --------------------------------------------------------------------------- #
# Migração do layout plano (LOSSLESS)
# --------------------------------------------------------------------------- #


def test_migra_layout_plano_para_channels_sem_perda(tmp_path):
    instance = tmp_path / "instance"
    antes = _criar_instance_plano(instance, handle="@meucanal")

    resultado = garantir_layout_de_canais(instance_root=instance)

    assert resultado.acao == "migrado"
    assert resultado.canal_id == "meucanal"
    destino = instance / "channels" / "meucanal"
    assert resultado.canal_root == destino

    # Ponteiro de canal ativo criado e apontando para o canal.
    assert (instance / "active-channel").read_text(encoding="utf-8").strip() == "meucanal"

    # LOSSLESS: tudo que era plano está agora sob o canal, com checksums idênticos.
    depois = _checksums(destino)
    assert depois == antes

    # Nada sobrou no nível raiz além de channels/ e active-channel.
    sobras = {p.name for p in instance.iterdir()} - {"channels", "active-channel"}
    assert sobras == set()


def test_migracao_e_idempotente(tmp_path):
    instance = tmp_path / "instance"
    _criar_instance_plano(instance)

    primeiro = garantir_layout_de_canais(instance_root=instance)
    estado_apos_primeiro = _checksums(instance)

    segundo = garantir_layout_de_canais(instance_root=instance)
    estado_apos_segundo = _checksums(instance)

    assert primeiro.acao == "migrado"
    assert segundo.acao == "noop"
    assert segundo.canal_id == primeiro.canal_id
    # 2ª passagem não mexe em NADA.
    assert estado_apos_segundo == estado_apos_primeiro


def test_id_do_canal_cai_para_default_sem_channel_yaml(tmp_path):
    instance = tmp_path / "instance"
    instance.mkdir()
    (instance / "editorial").mkdir()
    (instance / "editorial" / "x.md").write_text("conteudo", encoding="utf-8")

    resultado = garantir_layout_de_canais(instance_root=instance)

    assert resultado.acao == "migrado"
    assert resultado.canal_id == "default"
    assert (instance / "channels" / "default" / "editorial" / "x.md").is_file()


def test_id_do_canal_usa_nome_quando_handle_ausente(tmp_path):
    instance = tmp_path / "instance"
    instance.mkdir()
    (instance / "channel.yaml").write_text('nome: "Canal Notícias"\n', encoding="utf-8")

    resultado = garantir_layout_de_canais(instance_root=instance)

    assert resultado.canal_id == "canal-not-cias" or resultado.canal_id == "canal-noticias"
    # acento vira separador; o importante é um slug estável e não-default.
    assert resultado.canal_id != "default"


# --------------------------------------------------------------------------- #
# Instalação nova
# --------------------------------------------------------------------------- #


def test_instalacao_nova_cria_canal_do_exemplo(tmp_path):
    instance = tmp_path / "instance"  # não existe
    exemplo = tmp_path / "exemplo"
    _criar_exemplo(exemplo)

    resultado = garantir_layout_de_canais(instance_root=instance, exemplo_dir=exemplo)

    assert resultado.acao == "instalado"
    assert resultado.canal_id == "seucanal"
    canal = instance / "channels" / "seucanal"
    assert (canal / "channel.yaml").is_file()
    assert (canal / "editorial" / ".gitkeep").is_file()
    assert (instance / "active-channel").read_text(encoding="utf-8").strip() == "seucanal"


def test_instalacao_nova_sem_exemplo_aborta(tmp_path):
    instance = tmp_path / "instance"
    exemplo = tmp_path / "exemplo-inexistente"

    with pytest.raises(LayoutMigrationError):
        garantir_layout_de_canais(instance_root=instance, exemplo_dir=exemplo)


# --------------------------------------------------------------------------- #
# Defensivo / auto-cura
# --------------------------------------------------------------------------- #


def test_aborta_quando_ha_channels_e_itens_planos(tmp_path):
    """Estado ambíguo (migração interrompida) → não adivinha, aborta."""
    instance = tmp_path / "instance"
    _criar_instance_plano(instance)
    (instance / "channels" / "meucanal").mkdir(parents=True)

    with pytest.raises(LayoutMigrationError):
        garantir_layout_de_canais(instance_root=instance)


def test_settings_db_na_raiz_nao_e_item_plano(tmp_path):
    """D-191: `instance/settings.db` é artefato global reservado — não dispara
    'layout inconsistente' nem é movido para dentro do canal."""
    instance = tmp_path / "instance"
    (instance / "channels" / "meucanal").mkdir(parents=True)
    (instance / "channels" / "meucanal" / "channel.yaml").write_text("nome: x\n", encoding="utf-8")
    (instance / "active-channel").write_text("meucanal\n", encoding="utf-8")
    (instance / "settings.db").write_text("", encoding="utf-8")

    resultado = garantir_layout_de_canais(instance_root=instance)

    assert resultado.acao == "noop"
    # settings.db continua na raiz da instância (não foi movido para o canal).
    assert (instance / "settings.db").exists()
    assert not (instance / "channels" / "meucanal" / "settings.db").exists()


def test_cura_ponteiro_ausente_com_canal_unico(tmp_path):
    instance = tmp_path / "instance"
    (instance / "channels" / "meucanal").mkdir(parents=True)
    (instance / "channels" / "meucanal" / "channel.yaml").write_text("nome: x\n", encoding="utf-8")
    # sem active-channel

    resultado = garantir_layout_de_canais(instance_root=instance)

    assert resultado.acao == "noop"
    assert resultado.canal_id == "meucanal"
    assert (instance / "active-channel").read_text(encoding="utf-8").strip() == "meucanal"


def test_aborta_ponteiro_ausente_com_multiplos_canais(tmp_path):
    instance = tmp_path / "instance"
    (instance / "channels" / "a").mkdir(parents=True)
    (instance / "channels" / "b").mkdir(parents=True)

    with pytest.raises(LayoutMigrationError):
        garantir_layout_de_canais(instance_root=instance)


# --------------------------------------------------------------------------- #
# Resolução do canal ativo (channel_paths)
# --------------------------------------------------------------------------- #


def test_active_channel_root_segue_o_ponteiro(tmp_path, monkeypatch):
    instance = tmp_path / "instance"
    _criar_instance_plano(instance, handle="@meucanal")
    monkeypatch.setattr(channel_paths, "_REPO_ROOT", tmp_path)

    garantir_layout_de_canais(instance_root=instance)

    assert channel_paths.active_channel_root() == instance / "channels" / "meucanal"
    assert channel_paths.editorial_dir() == instance / "channels" / "meucanal" / "editorial"
    assert channel_paths.mascot_dir() == instance / "channels" / "meucanal" / "mascot"


def test_active_channel_root_fallback_plano_sem_ponteiro(tmp_path, monkeypatch):
    """Layout legado/pré-migração: sem ponteiro, resolve para o `instance/` plano."""
    instance = tmp_path / "instance"
    (instance / "editorial").mkdir(parents=True)
    monkeypatch.setattr(channel_paths, "_REPO_ROOT", tmp_path)

    assert channel_paths.active_channel_root() == instance
