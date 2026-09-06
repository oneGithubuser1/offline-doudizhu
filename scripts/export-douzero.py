"""Convert published DouZero weights to offline ONNX and verify parity.

Development only: python -m pip install torch onnx onnxruntime numpy
Place the three .ckpt files in .ai-reference first (sources in THIRD_PARTY_NOTICES.md).
Architecture adapted from kwai/DouZero under Apache-2.0; see licenses/.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[1]
torch.set_num_threads(1)


class ValueNetwork(nn.Module):
    def __init__(self, width):
        super().__init__()
        self.lstm = nn.LSTM(162, 128, batch_first=True)
        self.dense1 = nn.Linear(width + 128, 512)
        for i in range(2, 6):
            setattr(self, f"dense{i}", nn.Linear(512, 512))
        self.dense6 = nn.Linear(512, 1)

    def forward(self, z, x):
        # All candidate actions share the same history. Compute its LSTM once.
        history, _ = self.lstm(z)
        combined = torch.cat([history[:, -1, :].expand(x.shape[0], -1), x], dim=-1)
        for i in range(1, 6):
            combined = torch.relu(getattr(self, f"dense{i}")(combined))
        return self.dense6(combined)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--objective", choices=["ADP", "WP"], default="ADP")
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".ai-reference")
    parser.add_argument("--destination", type=Path, default=ROOT / "public" / "models")
    parser.add_argument("--source-commit", default="594404922ee3810e2d84b80bb2c2846cb20e5390")
    parser.add_argument("--source-repository", default="Netease-Games-AI-Lab-Guangzhou/PerfectDou")
    return parser.parse_args()


def main():
    args = parse_args()
    destination = args.destination.resolve()
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {"model": f"DouZero {args.objective}", "format": "ONNX float32",
                "sourceRepository": args.source_repository,
                "sourceCommit": args.source_commit, "models": {}}
    for seat in ["landlord", "landlord_up", "landlord_down"]:
        source = args.source_dir.resolve() / f"{seat}.ckpt"
        width = 373 if seat == "landlord" else 484
        model = ValueNetwork(width)
        model.load_state_dict(torch.load(source, map_location="cpu", weights_only=True), strict=True)
        model.eval()
        z = torch.zeros((1, 5, 162))
        x = torch.zeros((1, width))
        output = destination / f"{seat}.onnx"
        torch.onnx.export(model, (z, x), str(output), input_names=["z", "x"], output_names=["values"],
                          dynamic_axes={"x": {0: "actions"}, "values": {0: "actions"}},
                          opset_version=17, dynamo=False)
        onnx.checker.check_model(onnx.load(output))
        session = ort.InferenceSession(str(output), providers=["CPUExecutionProvider"])
        rng = np.random.default_rng(20260905)
        max_error = 0.0
        for count in [1, 7, 64, 241]:
            z_np = rng.integers(0, 2, size=(1, 5, 162)).astype(np.float32)
            x_np = rng.integers(0, 2, size=(count, width)).astype(np.float32)
            with torch.no_grad():
                expected = model(torch.from_numpy(z_np), torch.from_numpy(x_np)).numpy()
            actual = session.run(["values"], {"z": z_np, "x": x_np})[0]
            np.testing.assert_allclose(actual, expected, rtol=2e-4, atol=2e-4)
            assert actual.argmax() == expected.argmax()
            max_error = max(max_error, float(np.max(np.abs(actual - expected))))
        manifest["models"][seat] = {"sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                                     "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                                     "bytes": output.stat().st_size, "maxParityError": max_error}
        print(f"{seat}: {output.stat().st_size} bytes, max parity error {max_error:.8f}", flush=True)
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
