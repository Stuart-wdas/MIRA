"""Opt-in Nerfstudio launcher; ordinary worker jobs still use ns-train unchanged."""
from pathlib import Path
import sys

from nerfstudio.engine.callbacks import TrainingCallback, TrainingCallbackLocation
from nerfstudio.models.splatfacto import SplatfactoModel
from nerfstudio.scripts.train import entrypoint

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from worker.preview import SnapshotWriter


def install_preview_callback():
    original = SplatfactoModel.get_training_callbacks

    def callbacks(model, training_callback_attributes):
        existing = original(model, training_callback_attributes)
        writer = SnapshotWriter(Path.cwd() / 'preview')

        def snapshot(step: int):
            writer.capture(model, step)

        return existing + [TrainingCallback(
            where_to_run=[TrainingCallbackLocation.AFTER_TRAIN_ITERATION],
            func=snapshot, update_every_num_iters=250,
        )]

    SplatfactoModel.get_training_callbacks = callbacks


if __name__ == '__main__':
    install_preview_callback()
    entrypoint()
