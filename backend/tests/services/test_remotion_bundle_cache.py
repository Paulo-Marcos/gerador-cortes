"""Testes do RemotionBundleCache.

O `builder` aceita uma assinatura async (Path -> awaitable). Aqui usamos
helpers que escrevem `index.html` no diretório de saída — exatamente o
que o `remotion bundle` faria, mas sem invocar o Remotion real.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

import pytest
from app.services.remotion_bundle_cache import RemotionBundleCache

# ─────────────────────────────────────────────────────────────
# Helpers — builders fake
# ─────────────────────────────────────────────────────────────


def _fingerprint(seed: int) -> str:
    # Fingerprints válidos têm cara de hash: hex sem separadores. Aqui
    # usamos seeds curtos repetidos para chegar a 64 chars (compatível
    # com SHA256), mas o cache não exige tamanho fixo.
    return f"{seed:064d}"


def _build_ok(content: str = "<html><body>bundle</body></html>"):
    async def builder(target_dir: Path) -> None:
        (target_dir / "index.html").write_text(content, encoding="utf-8")

    return builder


def _build_falha(message: str = "boom"):
    async def builder(target_dir: Path) -> None:
        # Cria algum lixo parcial para testar a limpeza
        (target_dir / "parcial.txt").write_text("incompleto", encoding="utf-8")
        raise RuntimeError(message)

    return builder


def _build_sem_index():
    async def builder(target_dir: Path) -> None:
        (target_dir / "outro.txt").write_text("sem html", encoding="utf-8")

    return builder


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


# ─────────────────────────────────────────────────────────────
# get_or_create — cache hit / miss
# ─────────────────────────────────────────────────────────────


class TestGetOrCreate:
    def test_cache_miss_chama_builder_e_retorna_path(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        fp = _fingerprint(1)
        result = asyncio.run(cache.get_or_create(fp, _build_ok()))
        assert (result / "index.html").exists()

    def test_cache_hit_nao_chama_builder(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        fp = _fingerprint(2)
        asyncio.run(cache.get_or_create(fp, _build_ok("primeira")))

        chamadas = {"count": 0}

        async def builder_que_nao_deve_ser_chamado(target_dir: Path) -> None:
            chamadas["count"] += 1
            (target_dir / "index.html").write_text("segunda", encoding="utf-8")

        result = asyncio.run(cache.get_or_create(fp, builder_que_nao_deve_ser_chamado))
        assert chamadas["count"] == 0
        assert (result / "index.html").read_text(encoding="utf-8") == "primeira"

    def test_fingerprints_diferentes_geram_pastas_diferentes(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        a = asyncio.run(cache.get_or_create(_fingerprint(10), _build_ok()))
        b = asyncio.run(cache.get_or_create(_fingerprint(11), _build_ok()))
        assert a != b


# ─────────────────────────────────────────────────────────────
# lookup
# ─────────────────────────────────────────────────────────────


class TestLookup:
    def test_lookup_sem_entrada_retorna_none(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        assert cache.lookup(_fingerprint(99)) is None

    def test_lookup_apos_create_retorna_path(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        fp = _fingerprint(3)
        asyncio.run(cache.get_or_create(fp, _build_ok()))
        assert cache.lookup(fp) is not None

    def test_lookup_para_bundle_sem_commit_retorna_none(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        fp = _fingerprint(4)
        entry_dir = tmp_path / "cache" / fp
        entry_dir.mkdir(parents=True)
        (entry_dir / "index.html").write_text("órfão", encoding="utf-8")
        # Sem committed.txt: cache não considera pronto
        assert cache.lookup(fp) is None


# ─────────────────────────────────────────────────────────────
# Tratamento de falhas
# ─────────────────────────────────────────────────────────────


class TestFalhas:
    def test_builder_que_falha_apaga_pasta_parcial(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        fp = _fingerprint(5)

        with pytest.raises(RuntimeError, match="boom"):
            asyncio.run(cache.get_or_create(fp, _build_falha("boom")))

        assert not (tmp_path / "cache" / fp).exists()
        assert cache.lookup(fp) is None

    def test_builder_sem_index_html_apaga_e_levanta(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        fp = _fingerprint(6)

        with pytest.raises(RuntimeError, match="index.html"):
            asyncio.run(cache.get_or_create(fp, _build_sem_index()))

        assert cache.lookup(fp) is None

    def test_apos_falha_pode_tentar_de_novo(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        fp = _fingerprint(7)

        with pytest.raises(RuntimeError):
            asyncio.run(cache.get_or_create(fp, _build_falha()))

        result = asyncio.run(cache.get_or_create(fp, _build_ok("retry ok")))
        assert (result / "index.html").read_text(encoding="utf-8") == "retry ok"


# ─────────────────────────────────────────────────────────────
# LRU
# ─────────────────────────────────────────────────────────────


class TestLRU:
    def test_quando_excede_max_entries_remove_mais_antiga(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache", max_entries=2)
        fp_a = _fingerprint(20)
        fp_b = _fingerprint(21)
        fp_c = _fingerprint(22)

        asyncio.run(cache.get_or_create(fp_a, _build_ok("a")))
        time.sleep(0.01)
        asyncio.run(cache.get_or_create(fp_b, _build_ok("b")))
        time.sleep(0.01)
        asyncio.run(cache.get_or_create(fp_c, _build_ok("c")))

        # A é a mais antiga — deve ter sido removida
        assert cache.lookup(fp_a) is None
        assert cache.lookup(fp_b) is not None
        assert cache.lookup(fp_c) is not None

    def test_lookup_renova_timestamp_e_evita_eviction(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache", max_entries=2)
        fp_a = _fingerprint(30)
        fp_b = _fingerprint(31)
        fp_c = _fingerprint(32)

        asyncio.run(cache.get_or_create(fp_a, _build_ok("a")))
        time.sleep(0.01)
        asyncio.run(cache.get_or_create(fp_b, _build_ok("b")))
        time.sleep(0.01)
        # Renova A — agora B é o mais antigo
        cache.lookup(fp_a)
        time.sleep(0.01)
        asyncio.run(cache.get_or_create(fp_c, _build_ok("c")))

        assert cache.lookup(fp_a) is not None
        assert cache.lookup(fp_b) is None
        assert cache.lookup(fp_c) is not None

    def test_max_entries_zero_levanta(self, tmp_path: Path):
        with pytest.raises(ValueError):
            RemotionBundleCache(tmp_path, max_entries=0)


# ─────────────────────────────────────────────────────────────
# Stats e housekeeping
# ─────────────────────────────────────────────────────────────


class TestStats:
    def test_stats_em_cache_vazio(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        stats = cache.stats()
        assert stats.total_entries == 0
        assert stats.committed_entries == 0

    def test_stats_apos_dois_commits(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        asyncio.run(cache.get_or_create(_fingerprint(40), _build_ok()))
        asyncio.run(cache.get_or_create(_fingerprint(41), _build_ok()))
        stats = cache.stats()
        assert stats.total_entries == 2
        assert stats.committed_entries == 2

    def test_prune_orphans_remove_dir_sem_index(self, tmp_path: Path):
        cache = RemotionBundleCache(tmp_path / "cache")
        orfao = tmp_path / "cache" / _fingerprint(50)
        orfao.mkdir(parents=True)
        (orfao / "parcial.txt").write_text("ruim", encoding="utf-8")

        bom = tmp_path / "cache" / _fingerprint(51)
        bom.mkdir(parents=True)
        (bom / "index.html").write_text("ok", encoding="utf-8")
        (bom / "committed.txt").write_text(str(time.time()), encoding="utf-8")

        removidos = cache.prune_orphans()
        assert removidos == 1
        assert not orfao.exists()
        assert bom.exists()


# ─────────────────────────────────────────────────────────────
# Validação de fingerprint
# ─────────────────────────────────────────────────────────────


class TestValidacaoFingerprint:
    @pytest.mark.parametrize("fingerprint_invalido", ["", "../etc/passwd", "abc/def", "abc\\def"])
    def test_fingerprint_com_path_traversal_e_rejeitado(self, tmp_path: Path, fingerprint_invalido):
        cache = RemotionBundleCache(tmp_path / "cache")
        with pytest.raises(ValueError):
            cache.lookup(fingerprint_invalido)
