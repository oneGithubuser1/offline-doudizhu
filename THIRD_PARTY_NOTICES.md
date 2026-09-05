# Third-party notices

This application includes converted DouZero ADP model weights for offline inference.

- Original framework: [kwai/DouZero](https://github.com/kwai/DouZero), pinned source commit `718a5c920bf3361e34178a38f3b80458e176b351`.
- Model weight source: [Netease-Games-AI-Lab-Guangzhou/PerfectDou](https://github.com/Netease-Games-AI-Lab-Guangzhou/PerfectDou), pinned source commit `594404922ee3810e2d84b80bb2c2846cb20e5390`, directory `perfectdou/model/douzero/douzero_ADP`.
- Paper: Zha et al., “DouZero: Mastering DouDizhu with Self-Play Deep Reinforcement Learning,” ICML 2021.

Both upstream repositories are distributed under the Apache License 2.0. Copies are included in `licenses/DouZero-LICENSE.txt` and `licenses/PerfectDou-LICENSE.txt`.

The original checkpoints were converted to ONNX without changing their learned parameters. `public/models/manifest.json` records source and output SHA-256 hashes. The adapter only supplies information visible to the acting player: their hand, the combined unknown cards, public action history, remaining counts, and played cards. Opponents’ actual hand allocation is not exposed to the model.

Offline inference uses [Microsoft ONNX Runtime Web](https://github.com/microsoft/onnxruntime), version 1.29.0, under the MIT License. A copy is included in `licenses/ONNXRuntime-LICENSE.txt`.
