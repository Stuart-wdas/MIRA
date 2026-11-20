"""Small, atomic browser previews, captured from live training tensors on the training thread."""
import json
import math
import time
from pathlib import Path

import numpy as np


class SnapshotWriter:
    def __init__(self, directory: Path, max_splats: int = 200_000, min_seconds: float = 15):
        self.directory = directory
        self.max_splats = max_splats
        self.min_seconds = min_seconds
        self.last_write = float('-inf')
        self.disabled = False

    def capture(self, model, step: int) -> None:
        if self.disabled or time.monotonic() - self.last_write < self.min_seconds:
            return
        try:
            import torch
            with torch.no_grad():
                params = model.gauss_params
                count = len(params['means'])
                if not count:
                    return
                stride = max(1, math.ceil(count / self.max_splats))
                def cpu(key):
                    return params[key][::stride].detach().float().cpu().numpy()
                means = cpu('means')
                scales = np.exp(np.clip(cpu('scales'), -20, 20))
                rgb = np.clip(0.5 + 0.28209479177387814 * cpu('features_dc'), 0, 1)
                opacity = 1 / (1 + np.exp(-np.clip(cpu('opacities'), -20, 20)))
                quats = cpu('quats')  # Nerfstudio and .splat both store w, x, y, z.
                norms = np.linalg.norm(quats, axis=1, keepdims=True)
                quats = quats / np.maximum(norms, 1e-8)
            finite = np.isfinite(means).all(axis=1) & np.isfinite(scales).all(axis=1) & np.isfinite(quats).all(axis=1) & np.isfinite(rgb).all(axis=1) & np.isfinite(opacity).all(axis=1)
            packed = np.empty(int(finite.sum()), dtype=[('position', '<f4', 3), ('scale', '<f4', 3), ('rgba', 'u1', 4), ('rotation', 'u1', 4)])
            packed['position'] = means[finite]
            packed['scale'] = scales[finite]
            packed['rgba'][:, :3] = np.round(rgb[finite] * 255).astype(np.uint8)
            packed['rgba'][:, 3] = np.round(opacity[finite].reshape(-1) * 255).astype(np.uint8)
            packed['rotation'] = np.clip(quats[finite] * 128 + 128, 0, 255).astype(np.uint8)
            if not len(packed):
                return
            self.directory.mkdir(parents=True, exist_ok=True)
            filename = f'step-{step:09d}.splat'
            temporary = self.directory / (filename + '.tmp')
            packed.tofile(temporary)
            temporary.replace(self.directory / filename)
            self._metadata({'revision': step, 'filename': filename, 'step': step, 'splats': len(packed), 'total_splats': count, 'created_at': time.time()})
            self.last_write = time.monotonic()
            # Keep a few revisions so a browser already fetching an older snapshot can finish.
            for old in sorted(self.directory.glob('step-*.splat'))[:-3]:
                old.unlink(missing_ok=True)
        except Exception as error:
            # Preview failures must never turn a paid reconstruction into a failed job.
            self.disabled = True
            print(f'Live preview disabled: {error}', flush=True)
            try:
                self.directory.mkdir(parents=True, exist_ok=True)
                self._metadata({'error': str(error), 'step': step})
            except OSError:
                pass

    def _metadata(self, metadata: dict) -> None:
        temporary = self.directory / 'latest.json.tmp'
        temporary.write_text(json.dumps(metadata), encoding='utf-8')
        temporary.replace(self.directory / 'latest.json')
