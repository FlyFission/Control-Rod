"""Disposable OS-boundary probe. It does not launch or certify an agent runtime."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

CHILD = r'''
import json, os, socket
from pathlib import Path
import sys
secret, port, host_pid = sys.argv[1:]
try:
    Path('/work/repository/basis.md').write_text('changed')
    readonly = False
except OSError:
    readonly = True
Path('/work/out/probe-output.txt').write_text('permitted output')
try:
    with socket.create_connection(('127.0.0.1', int(port)), timeout=1):
        isolated_network = False
except OSError:
    isolated_network = True
print(json.dumps({
    'input_readable': Path('/work/repository/basis.md').read_text() == 'controlled input',
    'input_write_denied': readonly,
    'output_write_allowed': Path('/work/out/probe-output.txt').read_text() == 'permitted output',
    'host_secret_hidden': not Path(secret).exists(),
    'parent_environment_secret_absent': 'CONFINEMENT_TEST_SECRET' not in os.environ,
    'isolated_home': os.environ.get('HOME') == '/home/sandbox',
    'host_service_unreachable': isolated_network,
    'host_process_hidden': not Path('/proc/' + host_pid).exists(),
}))
'''

def probe():
    bubblewrap = shutil.which('bwrap')
    if not bubblewrap:
        raise RuntimeError('bubblewrap is unavailable; no boundary evidence')
    with tempfile.TemporaryDirectory(prefix='controlrod-confinement-') as directory:
        root = Path(directory)
        repository = root / 'repository'
        repository.mkdir()
        (repository / 'basis.md').write_text('controlled input')
        output = root / 'out'
        output.mkdir()
        secret = root / 'host-secret-canary'
        secret.write_text('test-only canary; not a real credential')
        script = root / 'check.py'
        script.write_text(CHILD)
        with socket.socket() as service:
            service.bind(('127.0.0.1', 0))
            service.listen()
            args = [bubblewrap, '--unshare-all', '--die-with-parent', '--new-session',
                    '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib',
                    '--ro-bind', '/lib64', '/lib64', '--symlink', 'usr/bin', '/bin',
                    '--dir', '/work', '--ro-bind', str(repository), '/work/repository',
                    '--bind', str(output), '/work/out', '--ro-bind', str(script), '/work/check.py',
                    '--tmpfs', '/tmp', '--tmpfs', '/home', '--dir', '/home/sandbox',
                    '--proc', '/proc', '--dev', '/dev', '--chdir', '/work',
                    '--clearenv', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/home/sandbox',
                    '/usr/bin/python3', '/work/check.py', str(secret), str(service.getsockname()[1]), str(os.getpid())]
            result = subprocess.run(args, env={**os.environ, 'CONFINEMENT_TEST_SECRET': 'test-only-canary'}, capture_output=True, text=True, timeout=15, check=True)
            checks = json.loads(result.stdout)
            if not all(checks.values()):
                raise RuntimeError('Boundary probe failed: ' + json.dumps(checks))
            return {'checks': checks,
                    'bubblewrap': subprocess.check_output([bubblewrap, '--version'], text=True).strip(),
                    'probe_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                    'scope': 'OS boundary with Python and synthetic canaries on this host',
                    'real_clis_integrated': False,
                    'credential_broker_proved': False,
                    'model_egress_policy_proved': False,
                    'assisted_preparation_enablement': 'HOLD'}

if __name__ == '__main__':
    print(json.dumps(probe(), indent=2))
