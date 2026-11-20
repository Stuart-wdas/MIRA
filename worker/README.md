# Mira GPU worker

This is now an optional local processing tool. The hosted application uses manual fulfilment: download videos from Admin > Scans and upload finished splats there. It does not connect to this worker. Start this service with `docker compose --profile gpu up --build -d reconstruction-worker` only on your GPU machine.

The standalone **Live splat beta** is at http://127.0.0.1:8787/beta/. Connect with your `RECONSTRUCTION_WORKER_TOKEN`, upload a video, and watch real snapshots from Gaussian training. Snapshots are captured at 250-step intervals, no more often than every 15 seconds, with up to 200,000 splats. COLMAP must finish before a scene appears. Only jobs started with live preview enabled can provide training snapshots; older jobs still offer their status and final PLY. Download the final PLY here and upload it to the customer order in the main app. See the root README for development and verification commands.

This service turns authorized walkthrough videos into Gaussian-splat PLY files using Nerfstudio's Splatfacto pipeline. Express remains responsible for users, ownership, quotas, and billing; this Python process remains responsible for reconstruction compute.

## Recommended: Docker Desktop

The repository includes a GPU-enabled Compose service based on the official Nerfstudio 1.1.5 image. From PowerShell in the repository root:

```powershell
docker compose up --build -d reconstruction-worker
docker compose ps
Invoke-RestMethod http://127.0.0.1:8787/health
```

The first build downloads roughly 5 GB of compressed image layers. Subsequent starts reuse the local image and are much faster. Reconstruction inputs, job telemetry, and exported models are kept in the `mira-reconstruction-data` Docker volume.

## Metrics and quality gates

Every job response includes a `metrics` object with:

- extracted and COLMAP-registered frame counts plus the alignment rate;
- the selected sparse model, sparse point count, and mean reprojection error;
- live training iteration, loss, PSNR, Gaussian count, GPU memory, elapsed time, and ETA;
- bounded history samples for frontend charts, a capture-quality verdict, and actionable warnings.

COLMAP can produce multiple disconnected sparse models. The worker automatically regenerates the Nerfstudio dataset from the model with the most registered frames and sparse points instead of assuming model `0` is best. It rejects a capture before training if fewer than 25% of its frames—or fewer than 12 frames—align.

Jobs are saved as `job.json` beside their data. Completed models and reports survive container restarts; an interrupted in-process training job is marked failed after a restart because local subprocesses cannot resume automatically.

Useful commands:

```powershell
docker compose logs -f reconstruction-worker
docker compose stop reconstruction-worker
docker compose up -d reconstruction-worker
```

To rebuild after editing `worker/app.py`:

```powershell
docker compose up --build -d reconstruction-worker
```

## Manual installation prerequisites

- A CUDA-capable NVIDIA GPU (the standard Splatfacto model is intended for roughly 6 GB or more of VRAM)
- A working Nerfstudio installation with `ns-process-data`, `ns-train`, and `ns-export` on `PATH`
- COLMAP and FFmpeg on `PATH`
- Python 3.10 or 3.11

Follow the [official Nerfstudio installation guide](https://docs.nerf.studio/quickstart/installation.html), then install the thin API layer:

```bash
pip install -r worker/requirements-api.txt
uvicorn worker.app:app --host 0.0.0.0 --port 8787
```

For a non-Docker installation, run `npm run build:beta` before starting Uvicorn to include the standalone page. Submit local walkthroughs through `/beta/` or `/docs`; the hosted web app no longer forwards videos to this service.

## Build modes

The upload API accepts a `build_mode` form field. Existing clients that omit it continue to use `high`.

- `quick`: 120 target frames, 4x downscale, and 2,500 iterations for the fastest camera and geometry check.
- `preview`: 180 target frames, 4x downscale, and 4,000 iterations for a fast explorable draft.
- `balanced`: 240 target frames, 2x downscale, and 6,500 iterations. This is the recommended default.
- `high`: 300 target frames, 2x downscale, and the configured high-quality iteration count.
- `maximum`: 400 target frames at source resolution and 15,000 iterations. This has the highest VRAM and processing-time cost.

The selected mode and its iteration target are persisted in the job report.

### Advanced tuning

Authorized clients can override a Maximum build by sending all three optional form fields together:

- `target_frames`: 60–1,200 sampled images spread across the entire video;
- `train_steps`: 1,000–15,000 Splatfacto iterations;
- `downscale_factor`: `1`, `2`, `4`, or `8`.

Partial overrides and overrides on a non-`maximum` build are rejected. The effective settings and `custom_tuning` flag are persisted in both PostgreSQL and the worker job report. A high frame target improves temporal coverage but makes feature extraction and COLMAP matching more expensive; lowering `train_steps` does not make COLMAP faster.

Configuration:

- `MIRA_DATA_ROOT`: job and model storage; defaults to `./reconstruction-data`
- `MIRA_TRAIN_STEPS`: Splatfacto iterations; defaults to `15000`
- `MIRA_QUICK_TRAIN_STEPS`: Quick-mode iterations; defaults to `2500`
- `MIRA_PREVIEW_TRAIN_STEPS`: Preview-mode Splatfacto iterations; defaults to `4000`
- `MIRA_BALANCED_TRAIN_STEPS`: Balanced-mode iterations; defaults to `6500`
- `MIRA_MAXIMUM_TRAIN_STEPS`: Maximum-mode iterations; defaults to `15000`
- `MIRA_METRICS_POLL_SECONDS`: interval for incrementally reading new TensorBoard events; defaults to `5`
- `MIRA_TRAIN_LOG_SAMPLES`: approximate number of progress updates per build, automatically scaled across quality packages; defaults to `100`
- `MIRA_ALLOWED_ORIGINS`: comma-separated browser origins
- `MIRA_GATEWAY_TOKEN`: optional shared secret required on every `/v1/reconstructions` request. Set it to the same value as Express's `RECONSTRUCTION_WORKER_TOKEN`.

Keep this worker private on your GPU machine. Customer ownership and billing remain in the hosted Express application; the beta does not grant credits or publish results to customer accounts.

The worker retains one incremental TensorBoard event reader for the duration of training. It never reparses the complete event history for every progress line. Progress logging is scaled to the selected package's iteration count, while the frontend still retains approximately sixty history samples. If the worker restarts after the final checkpoint was written but before PLY export completed, it detects that checkpoint and resumes at export instead of discarding or retraining the scene.

---

amOptimizerConfig( \_target=<class 'torch.optim.adam.Adam'>, lr=0.005, eps=1e-15, max_norm=None, weight_decay=0 ), 'scheduler': None }, 'quats': { 'optimizer': AdamOptimizerConfig( \_target=<class 'torch.optim.adam.Adam'>, lr=0.001, eps=1e-15, max_norm=None, weight_decay=0 ), 'scheduler': None }, 'camera_opt': { 'optimizer': AdamOptimizerConfig( \_target=<class 'torch.optim.adam.Adam'>, lr=0.0001, eps=1e-15, max_norm=None, weight_decay=0 ), 'scheduler': ExponentialDecaySchedulerConfig( \_target=<class 'nerfstudio.engine.schedulers.ExponentialDecayScheduler'>, lr_pre_warmup=0, lr_final=5e-07, warmup_steps=1000, max_steps=30000, ramp='cosine' ) }, 'bilateral_grid': { 'optimizer': AdamOptimizerConfig( \_target=<class 'torch.optim.adam.Adam'>, lr=0.002, eps=1e-15, max_norm=None, weight_decay=0 ), 'scheduler': ExponentialDecaySchedulerConfig( \_target=<class 'nerfstudio.engine.schedulers.ExponentialDecayScheduler'>, lr_pre_warmup=0, lr_final=0.0001, warmup_steps=1000, max_steps=30000, ramp='cosine' ) } }, vis='tensorboard', data=None, prompt=None, relative_model_dir=PosixPath('nerfstudio_models'), load_scheduler=True, steps_per_save=2000, steps_per_eval_batch=0, steps_per_eval_image=100, steps_per_eval_all_images=1000, max_num_iterations=1000, mixed_precision=False, use_grad_scaler=False, save_only_latest_checkpoint=True, load_dir=None, load_step=None, load_config=None, load_checkpoint=None, log_gradients=False, gradient_accumulation_steps={}, start_paused=False ) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── [16:45:51] Saving config to: experiment_config.py:136 /data/3854b6ea258b46f8a20e4c251f8560f6/training/unnamed/splatfacto/2026-08-30_164551 /config.yml Saving checkpoints to: trainer.py:142 /data/3854b6ea258b46f8a20e4c251f8560f6/training/unnamed/splatfacto/2026-08-30_164551/nerfstudi o_models No Nerfstudio checkpoint to load, so training from scratch. logging events to: /data/3854b6ea258b46f8a20e4c251f8560f6/training/unnamed/splatfacto/2026-08-30_164551 [16:45:58] Caching / undistorting train images full_images_datamanager.py:230 /usr/local/lib/python3.10/dist-packages/torch/\_inductor/compile_fx.py:135: UserWarning: TensorFloat32 tensor cores for float32 matrix multiplication available but not enabled. Consider setting `torch.set_float32_matmul_precision('high')` for better performance. warnings.warn( /usr/local/lib/python3.10/dist-packages/nerfstudio/models/splatfacto.py:124: UserWarning: Applied workaround for CuDNN issue, install nvrtc.so (Triggered internally at ../aten/src/ATen/native/cudnn/Conv_v8.cpp:80.) return tf.conv2d(image.permute(2, 0, 1)[:, None, ...], weight, stride=d).squeeze(1).permute(1, 2, 0) Step (% Done) Train Iter (time) ETA (time) -------------------------------------------------------------- 0 (0.00%) 2 m, 16 s 1 d, 13 h, 58 m, 13 s Step (% Done) Train Iter (time) ETA (time) Train Rays / Sec ----------------------------------------------------------------------------------- 10 (1.00%) 12 s, 541.985 ms 3 h, 26 m, 56 s 41.22 M 20 (2.00%) 83.098 ms 1 m, 21 s 48.52 M 30 (3.00%) 36.327 ms 35 s, 237.102 ms 59.03 M 40 (4.00%) 33.956 ms 32 s, 598.061 ms 61.43 M 50 (5.00%) 35.520 ms 33 s, 743.643 ms 58.58 M 60 (6.00%) 35.537 ms 33 s, 404.784 ms 58.49 M 70 (7.00%) 34.810 ms 32 s, 373.195 ms 59.54 M 80 (8.00%) 34.392 ms 31 s, 640.584 ms 60.38 M 90 (9.00%) 34.171 ms 31 s, 95.336 ms 61.05 M [16:48:20] Caching / undistorting eval images full_images_datamanager.py:230
