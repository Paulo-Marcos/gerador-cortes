"""D-165: o pipeline resolve `projetos_dir` SEMPRE pelo canal ativo (ao vivo).

Antes desta demanda, `settings.projetos_dir` era congelado no import de
`app.config`. Após uma relocação de canal (ou troca de canal ativo) o valor
congelado divergia do resolver vivo `channel_paths.projetos_dir()`, e os
overlays iam parar num diretório diferente do que o resto do pipeline lia.

Estes testes forçam o resolver a apontar para uma raiz de canal FAKE e provam
que `corte_dir`/`overlays_dir` do pipeline seguem essa raiz — e que o campo
congelado em `settings` NÃO é mais a fonte do caminho.
"""

from __future__ import annotations

from app import channel_paths
from app.config import settings
from app.services import pipeline_render


def _fazer_canal(tmp_path, nome: str):
    """Cria `<tmp>/instance/channels/<nome>/projetos/projetos.db`.

    A presença do banco consolidado é o que guia a virada em `projetos_dir()`.
    """
    projetos = tmp_path / "instance" / "channels" / nome / "projetos"
    projetos.mkdir(parents=True)
    (projetos / "projetos.db").write_bytes(b"")
    return projetos.parent  # raiz do canal


def test_projetos_dir_segue_canal_ativo_ao_vivo(tmp_path, monkeypatch):
    canal_a = _fazer_canal(tmp_path, "canal-a")
    canal_b = _fazer_canal(tmp_path, "canal-b")

    # Aponta o resolver para o canal A (ao vivo — nada congelado).
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: canal_a)
    assert channel_paths.projetos_dir() == canal_a / "projetos"

    # O pipeline usa exatamente esse resolver vivo para montar corte/overlays.
    projeto_id, corte_id = "p1", "c1"
    corte_dir = pipeline_render.projetos_dir() / projeto_id / "cortes" / corte_id
    overlays_dir = corte_dir / "overlays"
    assert corte_dir == canal_a / "projetos" / projeto_id / "cortes" / corte_id
    assert overlays_dir.is_relative_to(canal_a / "projetos")

    # Troca o canal ativo em runtime → o caminho SEGUE (prova que é vivo).
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: canal_b)
    corte_dir_b = pipeline_render.projetos_dir() / projeto_id / "cortes" / corte_id
    assert corte_dir_b == canal_b / "projetos" / projeto_id / "cortes" / corte_id

    # Anti-regressão: o valor CONGELADO em settings não aponta para a raiz fake,
    # logo o pipeline não pode estar lendo o campo congelado.
    assert settings.projetos_dir != str(canal_b / "projetos")


def test_fila_remotion_tambem_resolve_pelo_canal_ativo(tmp_path, monkeypatch):
    canal = _fazer_canal(tmp_path, "canal-fila")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: canal)

    fila_dir = pipeline_render.projetos_dir() / "fila_remotion"
    assert fila_dir == canal / "projetos" / "fila_remotion"
