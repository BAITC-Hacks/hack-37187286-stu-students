"""Exercise backend startup with fake dotenv files in isolated processes."""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = r'''
import importlib
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch
import dotenv

root, fake_env, scenario = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
sys.path.insert(0, str(root))
real_load = dotenv.load_dotenv

def load_fake(path, **kwargs):
    assert path == root / '.env'
    assert kwargs == {'override': False}
    return real_load(fake_env, **kwargs)

with patch.object(dotenv, 'load_dotenv', side_effect=load_fake):
    import backend.main as main
    before = main.health()['ai_configured']
    if scenario == 'late_file':
        fake_env.write_text('LLM_API_KEY=fake-key\nLLM_MODEL=fake-model\n', encoding='utf-8')
        assert main.health()['ai_configured'] is False
        importlib.reload(main)
    print(json.dumps({'before': before, 'after': main.health()['ai_configured'],
                     'inherited_preserved': os.getenv('LLM_API_KEY') == 'inherited-fake-key',
                     'base_url_loaded': os.getenv('LLM_BASE_URL') == 'https://provider.test/v1'}))
'''


@pytest.mark.parametrize('inherited,expected', [(None, True), ('', False), ('   ', False), ('inherited-fake-key', True)])
def test_root_dotenv_and_environment_precedence(tmp_path, inherited, expected):
    fake_env = tmp_path / 'root.env'
    fake_env.write_text('LLM_API_KEY=fake-key\nLLM_MODEL=fake-model\nLLM_BASE_URL=https://provider.test/v1\n', encoding='utf-8')
    result = run_startup(tmp_path, fake_env, inherited=inherited)
    assert result['before'] is expected
    assert result['base_url_loaded']
    assert result['inherited_preserved'] is (inherited == 'inherited-fake-key')


def test_dotenv_changes_require_startup_again(tmp_path):
    result = run_startup(tmp_path, tmp_path / 'created_later.env', scenario='late_file')
    assert result['before'] is False
    assert result['after'] is True


def run_startup(tmp_path, fake_env, *, inherited=None, scenario='normal'):
    # Never inherit real LLM credentials or read the developer's actual .env.
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith('LLM_') and key.upper() != 'PYTHON_DOTENV_DISABLED'}
    if inherited is not None:
        env['LLM_API_KEY'] = inherited
    other_cwd = tmp_path / 'unrelated'
    other_cwd.mkdir()
    (other_cwd / '.env').write_text('LLM_API_KEY=\nLLM_MODEL=\n', encoding='utf-8')
    process = subprocess.run(
        [sys.executable, '-c', SCRIPT, str(ROOT), str(fake_env), scenario],
        cwd=other_cwd, env=env, capture_output=True, text=True, timeout=30, check=True,
    )
    return json.loads(process.stdout)
