# Third-party notices

This application includes converted DouZero WP model weights for offline inference.

- Original framework: [kwai/DouZero](https://github.com/kwai/DouZero), pinned source commit `718a5c920bf3361e34178a38f3b80458e176b351`.
- Published checkpoint mirror: [palemoky/douzero-baselines](https://huggingface.co/palemoky/douzero-baselines), pinned revision `57b3914046c2a0877016b8b8830fd07cf5b0ba08`, directory `checkpoints/douzero_WP`. The mirror's ADP landlord checkpoint has the same SHA-256 (`6f2971813495e9c509cbd4a101213c49587472942fa0f018d04c139a6a647c2d`) as the previously verified published checkpoint.
- Paper: Zha et al., “DouZero: Mastering DouDizhu with Self-Play Deep Reinforcement Learning,” ICML 2021.

DouZero is distributed under the Apache License 2.0. A copy is included in `licenses/DouZero-LICENSE.txt`.

The original checkpoints were converted to ONNX without changing their learned parameters. `public/models/manifest.json` records source and output SHA-256 hashes. The adapter only supplies information visible to the acting player: their hand, the combined unknown cards, public action history, remaining counts, and played cards. Opponents’ actual hand allocation is not exposed to the model.

Offline inference uses [Microsoft ONNX Runtime Web](https://github.com/microsoft/onnxruntime), version 1.29.0, under the MIT License. A copy is included in `licenses/ONNXRuntime-LICENSE.txt`.
