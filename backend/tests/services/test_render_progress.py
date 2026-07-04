from app.services.render_progress import RenderProgressStore


def test_render_progress_lifecycle():
    corte_id = "corte-progress-test"

    RenderProgressStore.start(corte_id)
    running = RenderProgressStore.get(corte_id).to_dict()
    assert running["state"] == "running"
    assert running["running"] is True

    RenderProgressStore.update(corte_id, 42, "Fase 2/5")
    updated = RenderProgressStore.get(corte_id).to_dict()
    assert updated["progress"] == 42
    assert updated["stage"] == "Fase 2/5"

    RenderProgressStore.done(corte_id)
    done = RenderProgressStore.get(corte_id).to_dict()
    assert done["state"] == "done"
    assert done["progress"] == 100
    assert done["running"] is False


def test_render_progress_caps_running_progress_at_99():
    corte_id = "corte-progress-cap-test"

    RenderProgressStore.start(corte_id)
    RenderProgressStore.update(corte_id, 120, "Quase concluído")

    assert RenderProgressStore.get(corte_id).progress == 99
