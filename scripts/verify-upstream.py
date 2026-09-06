"""Check TypeScript observations against the unmodified official DouZero encoder.

Run node scripts/run-ai-tools.mjs cases first. Reference sources are pinned in
THIRD_PARTY_NOTICES.md. Produces independent regression fixtures for Vitest.
"""
import ast
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import onnxruntime as ort
import torch

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--source-dir", type=Path, default=ROOT / ".ai-reference" / "wp-onnx")
args = parser.parse_args()
source = (ROOT / ".ai-reference" / "env.py").read_text(encoding="utf-8")
tree = ast.parse(source)
# Load only the observation constants/functions, without importing the upstream game.
tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef) or
             isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in
                                                  {"Card2Column", "NumOnes2Array"} for t in node.targets)]
namespace = {"np": np, "Counter": Counter}
exec(compile(tree, "upstream-douzero-env.py", "exec"), namespace)
spec = importlib.util.spec_from_file_location("upstream_models", ROOT / ".ai-reference" / "models.py")
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)
torch.set_num_threads(1)
models = {}
sessions = {}
fixtures = []


def ranks(cards):
    return sorted({15: 17, 16: 20, 17: 30}.get(c["rank"], c["rank"]) for c in cards)


for case in json.loads((ROOT / ".ai-reference" / "encoding-cases.json").read_text()):
    view = case["view"]
    landlord = view["landlordIndex"]
    seats = {landlord: "landlord", (landlord + 2) % 3: "landlord_down", (landlord + 1) % 3: "landlord_up"}
    seat = seats[view["ownIndex"]]
    played = {s: [] for s in seats.values()}
    last = {s: [] for s in seats.values()}
    sequence = []
    bombs = 0
    for action in view["publicHistory"]:
        cards = ranks(action["cards"])
        played[seats[action["playerIndex"]]].extend(cards)
        last[seats[action["playerIndex"]]] = cards
        sequence.append(cards)
        bombs += int(cards == [20, 30] or len(cards) == 4 and len(set(cards)) == 1)
    unknown = Counter([r for r in range(3, 15) for _ in range(4)] + [17] * 4 + [20, 30])
    unknown.subtract(ranks(view["hand"]) + ranks(view["playedCards"]))
    info = SimpleNamespace(player_position=seat, player_hand_cards=ranks(view["hand"]),
                           other_hand_cards=list(unknown.elements()), last_move=ranks(view["lastPlay"]["cards"]) if view["lastPlay"] else [],
                           played_cards=played, last_move_dict=last, card_play_action_seq=sequence, bomb_num=bombs,
                           num_cards_left_dict={seats[i]: n for i, n in enumerate(view["remainingCardCounts"])},
                           legal_actions=[ranks(action) for action in case["actions"]])
    obs = namespace["get_obs"](info)
    x, z = obs["x_batch"], obs["z_batch"]
    np.testing.assert_array_equal(x.flatten(), np.array(case["x"]))
    np.testing.assert_array_equal(z[0].flatten(), np.array(case["z"]))
    if seat not in models:
        model = original.model_dict[seat]()
        model.load_state_dict(torch.load(args.source_dir.resolve() / f"{seat}.ckpt", map_location="cpu", weights_only=True))
        models[seat] = model.eval()
        sessions[seat] = ort.InferenceSession(str(ROOT / "public" / "models" / f"{seat}.onnx"), providers=["CPUExecutionProvider"])
    with torch.no_grad():
        expected = models[seat](torch.from_numpy(z), torch.from_numpy(x), return_value=True)["values"].numpy()
    actual = sessions[seat].run(["values"], {"z": z[:1], "x": x})[0]
    np.testing.assert_allclose(actual, expected, rtol=1e-4, atol=1e-4)
    assert actual.argmax() == expected.argmax()
    fixtures.append({"view": view, "xSha256": hashlib.sha256(x.tobytes()).hexdigest(),
                     "zSha256": hashlib.sha256(z[0].tobytes()).hexdigest(),
                     "bestAction": case["actions"][int(expected.argmax())], "values": expected.flatten().tolist()})
destination = ROOT / "tests" / "fixtures"
destination.mkdir(parents=True, exist_ok=True)
(destination / "douzero-parity.json").write_text(json.dumps(fixtures, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"PASS: {len(fixtures)} real observations exactly match official encodings; ONNX values and best actions match original PyTorch.")
