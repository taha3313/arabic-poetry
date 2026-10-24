import os

from app import core


def test_env_key_change_is_loaded_without_restart(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    monkeypatch.setattr(core, "ENV_FILE", env)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    env.write_text("PROVIDER=gemini\nGEMINI_API_KEY=first-key\n")
    before = core.get_settings()
    assert before.api_key == "first-key"
    assert core.get_settings() is before
    stat = env.stat()
    env.write_text("PROVIDER=gemini\nGEMINI_API_KEY=other-key\n")
    os.utime(env, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
    after = core.get_settings()
    assert after.api_key == "other-key"
    assert after is not before


def test_missing_env_and_later_creation(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    monkeypatch.setattr(core, "ENV_FILE", env)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert core.get_settings().gemini_api_key == ""
    env.write_text("GEMINI_API_KEY=new-key\n")
    assert core.get_settings().gemini_api_key == "new-key"
