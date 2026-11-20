from pathlib import Path
from tempfile import TemporaryDirectory

from torch.utils.tensorboard import SummaryWriter

from worker.app import IncrementalTensorboardReader, latest_checkpoint_step, training_log_interval


def test_incremental_tensorboard_reader() -> None:
    with TemporaryDirectory() as directory:
        output_dir = Path(directory)
        writer = SummaryWriter(log_dir=output_dir)
        writer.add_scalar("Train Loss", 0.25, 10)
        writer.add_scalar("Train Metrics Dict/psnr", 22.5, 10)
        writer.flush()

        reader = IncrementalTensorboardReader(output_dir)
        reader.poll()
        first_loader = reader.loader
        values, step = reader.snapshot()
        assert values["loss"] == 0.25
        assert values["psnr"] == 22.5
        assert step == 10

        writer.add_scalar("Train Loss", 0.125, 20)
        writer.add_scalar("Train Metrics Dict/gaussian_count", 475_899, 20)
        writer.flush()
        reader.poll()
        values, step = reader.snapshot()
        assert reader.loader is first_loader
        assert values["loss"] == 0.125
        assert values["gaussian_count"] == 475_899
        assert step == 20
        writer.close()


def test_package_scaled_logging() -> None:
    assert [training_log_interval(steps) for steps in (2_500, 4_000, 6_500, 10_000, 15_000)] == [25, 40, 65, 100, 150]


def test_final_checkpoint_detection() -> None:
    with TemporaryDirectory() as directory:
        checkpoint = Path(directory) / "run" / "nerfstudio_models" / "step-000014999.ckpt"
        checkpoint.parent.mkdir(parents=True)
        checkpoint.touch()
        assert latest_checkpoint_step(Path(directory)) == 14_999


if __name__ == "__main__":
    test_incremental_tensorboard_reader()
    test_package_scaled_logging()
    test_final_checkpoint_detection()
    print("worker metrics tests passed")
