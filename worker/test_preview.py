import importlib
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import numpy as np
import torch

from worker.preview import SnapshotWriter


def test_snapshots():
    with TemporaryDirectory() as directory:
        model = SimpleNamespace(gauss_params={
            'means': torch.arange(30, dtype=torch.float32).reshape(10, 3),
            'scales': torch.zeros(10, 3),
            'features_dc': torch.zeros(10, 3),
            'opacities': torch.zeros(10, 1),
            'quats': torch.tensor([[1., 0., 0., 0.]] * 10),
        })
        root = Path(directory)
        writer = SnapshotWriter(root, max_splats=4, min_seconds=0)
        for step in (0, 250, 500, 750):
            writer.capture(model, step)
        metadata = json.loads((root / 'latest.json').read_text())
        assert metadata['revision'] == 750
        assert metadata['total_splats'] == 10 and metadata['splats'] == 4
        assert len(list(root.glob('*.splat'))) == 3
        raw = (root / metadata['filename']).read_bytes()
        assert len(raw) == 4 * 32
        assert np.frombuffer(raw[:12], dtype='<f4').tolist() == [0, 1, 2]
        assert np.frombuffer(raw[12:24], dtype='<f4').tolist() == [1, 1, 1]
        assert list(raw[24:32]) == [128, 128, 128, 128, 255, 128, 128, 128]
        assert not list(root.glob('*.tmp'))
        throttled = SnapshotWriter(root, min_seconds=999)
        throttled.capture(model, 1000)
        throttled.capture(model, 1250)
        assert json.loads((root / 'latest.json').read_text())['revision'] == 1000
        broken = SnapshotWriter(root, min_seconds=0)
        broken.capture(SimpleNamespace(gauss_params={}), 1500)
        assert broken.disabled
        assert 'error' in json.loads((root / 'latest.json').read_text())


def test_routes():
    # Import the API with isolated storage; never run recovery against real worker jobs.
    with TemporaryDirectory() as directory:
        os.environ['MIRA_DATA_ROOT'] = directory
        os.environ['MIRA_GATEWAY_TOKEN'] = 'preview-test-secret'
        app = importlib.import_module('worker.app')
        from fastapi.testclient import TestClient
        client = TestClient(app.app)
        auth = {'X-Mira-Worker-Token': 'preview-test-secret'}
        job_id = 'a' * 32
        job = app.Job(id=job_id, name='Preview test', location='', live_preview=True)
        app.jobs[job_id] = job
        assert client.get('/v1/reconstructions').status_code == 401
        assert client.get(f'/v1/reconstructions/{job_id}/preview').status_code == 401
        assert client.get(f'/v1/reconstructions/{job_id}/preview/0').status_code == 401
        assert client.get('/v1/reconstructions', headers=auth).json()['jobs'][0]['live_preview'] is True
        assert client.get(f'/v1/reconstructions/{job_id}/preview', headers=auth).json() == {'available': False}
        assert client.get('/v1/reconstructions/not-a-job/preview', headers=auth).status_code == 404
        assert client.get(f'/v1/reconstructions/{job_id}/preview/0', headers=auth).status_code == 404
        previews = Path(directory) / job_id / 'preview'
        previews.mkdir(parents=True)
        (previews / 'step-000000250.splat').write_bytes(b'example snapshot')
        (previews / 'latest.json').write_text(json.dumps({'revision': 250, 'filename': 'step-000000250.splat'}))
        assert client.get(f'/v1/reconstructions/{job_id}/preview', headers=auth).json()['available'] is True
        assert client.get(f'/v1/reconstructions/{job_id}/preview/250', headers=auth).content == b'example snapshot'
        assert client.get(f'/v1/reconstructions/{job_id}/model', headers=auth).status_code == 404
        submitted = []
        app.run_pipeline = lambda job_id, video: submitted.append(job_id)
        response = client.post('/v1/reconstructions', headers=auth,
            data={'name': 'Live upload', 'build_mode': 'quick', 'live_preview': 'true'},
            files={'video': ('test.mp4', b'test video', 'video/mp4')})
        assert response.status_code == 202, response.text
        assert response.json()['live_preview'] is True
        assert response.json()['id'] in submitted
        response = client.post('/v1/reconstructions', headers=auth,
            data={'build_mode': 'quick'}, files={'video': ('test.mp4', b'test', 'video/mp4')})
        assert response.json()['live_preview'] is False


def test_callback_registration():
    from nerfstudio.models.splatfacto import SplatfactoModel
    from worker.train_preview import install_preview_callback
    previous = SplatfactoModel.get_training_callbacks
    try:
        install_preview_callback()
        model = SimpleNamespace(step_cb=lambda step: None, step_post_backward=lambda step: None)
        callbacks = SplatfactoModel.get_training_callbacks(model, SimpleNamespace(optimizers=None))
        assert len(callbacks) == 3
        assert callbacks[-1].update_every_num_iters == 250
    finally:
        SplatfactoModel.get_training_callbacks = previous


if __name__ == '__main__':
    test_snapshots()
    test_routes()
    test_callback_registration()
    print('live preview tests passed')
