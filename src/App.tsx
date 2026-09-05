import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { chooseBid, chooseHint, choosePlay, createAiView } from "./ai/strategy";
import { AiWorkerClient } from "./ai/worker-client";
import { playImpactSound, setBgmEnabled, setMusicVolume, unlockBgm } from "./audio/bgm";
import {
  announcePlay,
  announceRemaining,
  playRoundResult,
  setVoiceEnabled,
  unlockVoice,
} from "./audio/voice";
import { Avatar } from "./components/Avatar";
import { PlayingCard } from "./components/PlayingCard";
import { RANK_LABEL, sortCards, type Card } from "./core/cards";
import {
  createNewSave,
  createRound,
  isSaveData,
  passTurn,
  placeBid,
  playCards,
  remainingRankCounts,
  startNextRound,
  updateSettings,
  type SaveData,
} from "./core/game";
import { canBeat, classifyPlay, PLAY_LABEL } from "./core/patterns";

const HUMAN_INDEX = 0;
const MIN_AI_DELAY_MS = 1600;
const previewScene = import.meta.env.DEV ? new URLSearchParams(location.search).get("preview") : null;

const browserBridge = {
  loadSave: async () => {
    const value = localStorage.getItem("riverlab-doudizhu-save");
    return value ? JSON.parse(value) : null;
  },
  saveGame: async (data: unknown) => {
    localStorage.setItem("riverlab-doudizhu-save", JSON.stringify(data));
    return { ok: true };
  },
};

function bridge() {
  return window.riverLab ?? browserBridge;
}

function scoreText(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function App() {
  const [data, setData] = useState<SaveData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("正在读取存档……");
  const [showStats, setShowStats] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [hintPending, setHintPending] = useState(false);
  const [aiFallback, setAiFallback] = useState(false);
  const [aiClient] = useState(() => new AiWorkerClient());
  const latestRound = useRef(data?.round);
  latestRound.current = data?.round;
  const heardActionSerial = useRef<number | null>(null);
  const heardRoundNumber = useRef<number | null>(null);

  useEffect(() => () => aiClient.dispose(), [aiClient]);

  useEffect(() => {
    let active = true;
    (previewScene
      ? import("./dev/preview").then(module => module.previewSave(previewScene))
      : bridge().loadSave())
      .then((saved) => {
        if (!active) return;
        const loaded = isSaveData(saved) ? saved : createNewSave();
        setData({
          ...loaded,
          settings: {
            ...loaded.settings,
            sound: loaded.settings.sound !== false,
            voice: loaded.settings.voice !== false,
            largeCards: false,
            aiDelayMs: Math.max(loaded.settings.aiDelayMs || 0, MIN_AI_DELAY_MS),
          },
        });
        setNotice("");
      })
      .catch(() => {
        if (!active) return;
        setData(createNewSave());
        setNotice("存档读取失败，已开始新游戏");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    setBgmEnabled(data.settings.sound);
    if (!data.settings.sound) return;
    const unlock = () => void unlockBgm();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [data?.settings.sound]);

  useEffect(() => {
    setMusicVolume(data?.settings.musicVolume ?? 0.45);
  }, [data?.settings.musicVolume]);

  useEffect(() => {
    if (!data) return;
    setVoiceEnabled(data.settings.voice !== false);
    if (data.settings.voice === false) return;
    void unlockVoice();
    const unlock = () => void unlockVoice();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [data?.settings.voice]);

  useEffect(() => {
    if (!data || previewScene) return;
    const timer = window.setTimeout(() => {
      bridge()
        .saveGame(data)
        .then((result) => {
          if (!result.ok) setNotice("自动存档失败，请稍后重试");
        })
        .catch(() => setNotice("自动存档失败，请稍后重试"));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [data]);

  const round = data?.round;
  const currentPlayer = round?.players[round.currentPlayerIndex];
  const explosiveType = round?.lastPlay?.pattern.type;

  useEffect(() => {
    if (!data || !round) return;
    const serial = round.actionSerial ?? 0;

    if (heardRoundNumber.current !== round.roundNumber) {
      heardRoundNumber.current = round.roundNumber;
      heardActionSerial.current = serial;
      return;
    }

    if (heardActionSerial.current === null) {
      heardActionSerial.current = serial;
      return;
    }

    const previousSerial = heardActionSerial.current;
    heardActionSerial.current = serial;
    if (data.settings.voice === false || serial <= previousSerial) return;

    const newActions = (round.actionHistory ?? [])
      .filter((record) => record.serial > previousSerial)
      .sort((left, right) => left.serial - right.serial);

    for (const record of newActions) {
      if (record.action.kind === "play" && record.action.cards) {
        const pattern = classifyPlay(record.action.cards);
        if (pattern) announcePlay(pattern);

        const remaining = round.players[record.playerIndex]?.hand.length;
        if (record.playerIndex !== HUMAN_INDEX && (remaining === 1 || remaining === 2)) {
          announceRemaining(record.playerIndex, remaining);
        }
      }

      if (
        record.action.kind === "result" &&
        round.phase === "finished" &&
        round.winnerTeam &&
        round.landlordIndex !== null
      ) {
        const humanWon = round.landlordIndex === HUMAN_INDEX
          ? round.winnerTeam === "landlord"
          : round.winnerTeam === "farmers";
        playRoundResult(humanWon);
      }
    }
  }, [data?.settings.voice, round?.actionSerial, round?.roundNumber]);

  useEffect(() => {
    setReviewing(false);
    if (round?.phase !== "finished") {
      setShowResult(false);
      return;
    }
    setShowResult(false);
    setNotice("");
    const timer = window.setTimeout(() => setShowResult(true), 6000);
    return () => window.clearTimeout(timer);
  }, [round?.phase, round?.roundNumber]);

  useEffect(() => {
    if (!data?.settings.sound || (explosiveType !== "bomb" && explosiveType !== "rocket")) return;
    void playImpactSound(explosiveType === "rocket");
  }, [data?.settings.sound, explosiveType, round?.playedCards.length]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [round?.currentPlayerIndex, round?.phase, round?.players[HUMAN_INDEX].hand.length]);

  useEffect(() => {
    if (!data || !round || !currentPlayer || currentPlayer.isHuman) return;
    if (round.phase === "finished" || (previewScene && previewScene !== "live")) return;

    const playerIndex = round.currentPlayerIndex;
    let active = true;
    const timer = window.setTimeout(() => {
      const view = createAiView(round, playerIndex);
      aiClient.request(round.phase, view).catch(() => ({
        id: 0, engine: "rules" as const,
        bid: round.phase === "bidding" ? chooseBid(view.hand, view.highestBid) : undefined,
        decision: round.phase === "playing" ? choosePlay(view) : undefined,
      })).then(reply => {
        if (!active) return;
        if (round.phase === "playing") setAiFallback(reply.engine !== "douzero");
        setData(current => {
          if (!current || current.round !== round) return current;
          if (round.phase === "bidding") return placeBid(current, playerIndex, reply.bid ?? 0);
          const decision = reply.decision ?? choosePlay(view);
          return decision.kind === "play" && decision.cards
            ? playCards(current, playerIndex, decision.cards)
            : passTurn(current, playerIndex);
        });
      });
    }, Math.max(data.settings.aiDelayMs, MIN_AI_DELAY_MS));
    return () => { active = false; window.clearTimeout(timer); };
  }, [round, data?.settings.aiDelayMs, aiClient]);

  const selectedCards = useMemo(() => {
    if (!round) return [];
    return round.players[HUMAN_INDEX].hand.filter((card) => selectedIds.has(card.id));
  }, [round, selectedIds]);

  if (!data || !round) {
    return <main className="loading-screen">{notice || "正在准备牌桌……"}</main>;
  }

  const human = round.players[HUMAN_INDEX];
  const humanTurn = round.currentPlayerIndex === HUMAN_INDEX;
  const canOperate = humanTurn && round.phase === "playing";
  const counter = remainingRankCounts(round, HUMAN_INDEX);

  const toggleCard = (card: Card) => {
    if (!canOperate) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(card.id)) next.delete(card.id);
      else next.add(card.id);
      return next;
    });
  };

  const submitCards = () => {
    if (!canOperate || selectedCards.length === 0) {
      setNotice("请先选择要出的牌");
      return;
    }
    const pattern = classifyPlay(selectedCards);
    if (!pattern) {
      setNotice("这些牌不能组成有效牌型");
      return;
    }
    if (!canBeat(pattern, round.lastPlay?.pattern ?? null)) {
      setNotice(`这手${PLAY_LABEL[pattern.type]}压不过桌上的牌`);
      return;
    }
    setData(playCards(data, HUMAN_INDEX, selectedCards));
    setNotice("");
  };

  const requestHint = async () => {
    if (!canOperate || hintPending) return;
    const view = createAiView(round, HUMAN_INDEX);
    // A hint never passes for strategic reasons: only when no legal reply exists.
    const fallbackCards = chooseHint(view);
    if (fallbackCards.length === 0 && round.lastPlay) {
      setSelectedIds(new Set());
      setData(passTurn(data, HUMAN_INDEX));
      return;
    }
    setHintPending(true);
    let cards = fallbackCards;
    try {
      const reply = await aiClient.request("playing", view);
      if (reply.decision?.kind === "play" && reply.decision.cards?.length) cards = reply.decision.cards;
    } catch { /* A valid rule hint remains available if model loading fails. */ }
    finally { setHintPending(false); }
    if (latestRound.current !== round) return;
    if (cards.length === 0) {
      setSelectedIds(new Set());
      if (round.lastPlay) {
        setData(passTurn(data, HUMAN_INDEX));
        setNotice("没有能压过的牌，已自动不出");
      }
      return;
    }
    setSelectedIds(new Set(cards.map((card) => card.id)));
    setNotice("");
  };

  const toggleMusic = () => {
    const next = !data.settings.sound;
    setBgmEnabled(next);
    if (next) void unlockBgm();
    setData(updateSettings(data, { sound: next }));
  };

  const toggleVoice = () => {
    const next = data.settings.voice === false;
    setVoiceEnabled(next);
    if (next) void unlockVoice();
    setData(updateSettings(data, { voice: next }));
  };

  const restart = () => {
    if (!window.confirm("放弃当前这局并重新发牌吗？已经结算的积分不会变化。")) return;
    setData({
      ...data,
      round: createRound(Math.random, round.roundNumber),
      savedAt: new Date().toISOString(),
    });
    setNotice("已重新发牌");
  };

  const renderOpponent = (index: number, side: "left" | "right") => {
    const player = round.players[index];
    const profile = data.profiles[index];
    const active = round.currentPlayerIndex === index && round.phase !== "finished";
    return (
      <section className={`opponent opponent-${side} ${active ? "active-seat" : ""}`}>
        <Avatar person={side === "left" ? "river" : "forest"} />
        <div className="seat-details">
          <div className="seat-name">
            {player.name}
            {player.role && <span className={`role-tag ${player.role}`}>{player.role === "landlord" ? "地主" : "农民"}</span>}
          </div>
          <div>积分 {profile.score}</div>
          <div className={`card-count ${player.hand.length <= 2 ? "few-cards" : ""}`}><b>{player.hand.length}</b> 张手牌</div>
        </div>
        {round.lastActions[index] && (
          <div
            className="speech-bubble"
            key={round.lastActions[index]?.serial ?? `${round.lastActions[index]?.text}-${round.playedCards.length}-${round.bidHistory.length}`}
          >
            {round.lastActions[index]?.text}
          </div>
        )}
        {round.phase === "finished" ? (
          <div className="revealed-hand">
            <span className="reveal-caption">{player.hand.length ? `剩余 ${player.hand.length} 张` : "已出完"}</span>
            {player.hand.length > 0 && (
              <div className="revealed-cards">
                {sortCards(player.hand).map((card) => (
                  <PlayingCard key={card.id} card={card} small disabled />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="back-stack" aria-hidden="true">
            {Array.from({ length: Math.min(7, player.hand.length) }, (_, item) => (
              <span key={item} style={{ transform: `translateX(${item * 4}px)` }} />
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <main className="game-shell fixed-cards">
      <header className="top-bar">
        <div className="brand-lockup">
          <span className="brand-seal">斗</span>
          <div>
            <h1>斗地主</h1>
            <small>闲 来 一 局 · v0.6.0</small>
          </div>
        </div>
        <div className="round-summary">
          <span>第 {round.roundNumber} 局</span>
          <span>底分 {round.highestBid || "—"}</span>
          <strong>倍数 ×{round.multiplier}</strong>
        </div>
        <div className="top-actions">
          <button type="button" onClick={() => setShowStats((value) => !value)}>战绩</button>
          <button
            type="button"
            className={data.settings.cardCounter ? "toggle-on" : ""}
            onClick={() => setData(updateSettings(data, { cardCounter: !data.settings.cardCounter }))}
          >
            记牌 {data.settings.cardCounter ? "开" : "关"}
          </button>
          <button
            type="button"
            className={data.settings.voice !== false ? "toggle-on" : ""}
            onClick={toggleVoice}
          >
            语音 {data.settings.voice !== false ? "开" : "关"}
          </button>
          <button type="button" onClick={restart}>重新发牌</button>
        </div>
      </header>

      {showStats && (
        <section className="stats-panel">
          <h2>累计战绩</h2>
          {data.profiles.map((profile) => (
            <div key={profile.id}>
              <strong>{profile.name}</strong>
              <span>积分 {profile.score}</span>
              <span>{profile.games} 局 / {profile.wins} 胜</span>
              <span>最高 ×{profile.bestMultiplier}</span>
            </div>
          ))}
        </section>
      )}

      <section className={`table ${round.phase === "finished" ? "round-finished" : ""}`}>
        <div className="table-felt" aria-hidden="true"><span>闲来一局</span><i>♠　♥　♣　♦</i></div>
        {renderOpponent(1, "left")}
        {renderOpponent(2, "right")}

        <div className="bottom-cards">
          <span>底牌</span>
          <div>
            {round.bottomRevealed
              ? round.bottomCards.map((card) => <PlayingCard key={card.id} card={card} small disabled />)
              : [0, 1, 2].map((item) => <span className="card-back" key={item}>福</span>)}
          </div>
        </div>

        <div className={`center-play played-by-${round.lastPlayBy ?? "none"}`}>
          {round.lastPlay ? (
            <div
              className={`played-group ${round.lastPlayBy === 0 ? "from-human" : round.lastPlayBy === 1 ? "from-left" : "from-right"} ${round.lastPlay.pattern.type === "bomb" ? "bomb-play" : round.lastPlay.pattern.type === "rocket" ? "rocket-play" : ""}`}
              key={`${round.lastPlayBy}-${round.playedCards.length}`}
            >
              {(round.lastPlay.pattern.type === "bomb" || round.lastPlay.pattern.type === "rocket") && (
                <div className="impact-effect" aria-hidden="true">
                  <span className="impact-ring impact-ring-one" />
                  <span className="impact-ring impact-ring-two" />
                  {Array.from({ length: round.lastPlay.pattern.type === "rocket" ? 16 : 12 }, (_, spark) => (
                    <i key={spark} style={{ "--spark": spark } as CSSProperties} />
                  ))}
                </div>
              )}
              <div className="play-label">
                <span>{round.lastPlayBy === null ? "" : round.players[round.lastPlayBy].name}</span>
                <b>{PLAY_LABEL[round.lastPlay.pattern.type]}</b>
              </div>
              <div className="mini-hand">
                {sortCards(round.lastPlay.cards).map((card) => (
                  <PlayingCard key={card.id} card={card} small disabled />
                ))}
              </div>
            </div>
          ) : (
            <div className="turn-message">
              {round.phase === "bidding"
                ? `${round.players[round.currentPlayerIndex].name}正在叫分`
                : `${round.players[round.currentPlayerIndex].name}先出牌`}
            </div>
          )}
        </div>

        {data.settings.cardCounter && (
          <aside className="counter-panel">
            <strong>记牌器</strong>
            {[17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((rank) => (
              <div key={rank} className={(counter.get(rank) ?? 0) === 0 ? "count-zero" : ""}>
                <span>{RANK_LABEL[rank]}</span>
                <b>{counter.get(rank) ?? 0}</b>
              </div>
            ))}
          </aside>
        )}

        <section className={`human-seat ${humanTurn ? "active-seat" : ""}`}>
          <div className="human-info">
            <strong>您</strong>
            <span className="human-score">积分 {data.profiles[HUMAN_INDEX].score}</span>
            {human.role && <span className={`role-tag ${human.role}`}>{human.role === "landlord" ? "地主" : "农民"}</span>}
          </div>

          <div className="controls">
            {round.phase === "bidding" && humanTurn && (
              <>
                <button type="button" className="secondary" onClick={() => setData(placeBid(data, HUMAN_INDEX, 0))}>不叫</button>
                {[1, 2, 3]
                  .filter((value) => value > round.highestBid)
                  .map((value) => (
                    <button type="button" key={value} onClick={() => setData(placeBid(data, HUMAN_INDEX, value))}>
                      {value}分
                    </button>
                  ))}
              </>
            )}
            {round.phase === "playing" && humanTurn && (
              <>
                <button type="button" className="secondary" disabled={hintPending} onClick={requestHint}>{hintPending ? "思考中…" : "提示"}</button>
                <button type="button" className="secondary" disabled={!round.lastPlay} onClick={() => { setNotice(""); setData(passTurn(data, HUMAN_INDEX)); }}>不出</button>
                <button type="button" className="primary" onClick={submitCards}>出牌</button>
              </>
            )}
            {round.phase !== "finished" && !humanTurn && (
              <div className="waiting">{currentPlayer?.name}正在思考…</div>
            )}
          </div>

          <div className={`selection-status ${canOperate && selectedCards.length ? "has-selection" : ""}`}>
            {canOperate
              ? selectedCards.length
                ? `已选 ${selectedCards.length} 张${classifyPlay(selectedCards) ? ` · ${PLAY_LABEL[classifyPlay(selectedCards)!.type]}` : " · 尚未组成牌型"}`
                : "轮到您出牌"
              : "\u00a0"}
          </div>

          <div
            className="human-hand"
            style={{ "--card-count": human.hand.length } as CSSProperties}
          >
            {sortCards(human.hand).map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedIds.has(card.id)}
                disabled={!canOperate}
                onClick={() => toggleCard(card)}
              />
            ))}
          </div>
        </section>
      </section>

      <footer className="table-footer">
        <div className="music-control">
          <button type="button" className={data.settings.sound ? "music-on" : ""} onClick={toggleMusic} aria-label={data.settings.sound ? "关闭音乐" : "开启音乐"}>♪</button>
          <span>{data.settings.sound ? "午后小调" : "音乐已关"}</span>
          <input type="range" min="0" max="100" value={Math.round((data.settings.musicVolume ?? 0.45) * 100)} aria-label="音乐音量" onChange={(event) => setData(updateSettings(data, { musicVolume: Number(event.target.value) / 100 }))} />
        </div>
        <span className="save-status"><i />{aiFallback ? "增强 AI 暂不可用 · 基础 AI 已接管" : "积分自动保存 · 离线畅玩"}</span>
      </footer>

      {notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}

      {round.phase === "finished" && !showResult && (
        <section className={`reveal-banner ${reviewing ? "reviewing" : ""}`}>
          <div>
            <strong>本局结束 · 剩余手牌已亮出</strong>
            <span>{reviewing ? "看完后，点击右侧查看结算" : "稍后进入积分结算"}</span>
          </div>
          <button type="button" onClick={() => setShowResult(true)}>{reviewing ? "查看结算" : "立即结算"}</button>
          <i aria-hidden="true" />
        </section>
      )}

      {round.phase === "finished" && showResult && (
        <div className="modal-backdrop">
          <section className="result-modal">
            <div className="result-icon">{round.winnerTeam === "landlord" ? "冠" : "胜"}</div>
            <h2>{round.winnerTeam === "landlord" ? "地主获胜" : "农民获胜"}</h2>
            {round.spring && <div className="spring-label">{round.spring === "spring" ? "春天" : "反春天"}，倍数翻倍</div>}
            <div className="result-scores">
              {round.players.map((player, index) => (
                <div key={player.id}>
                  <span>{player.name}</span>
                  <strong className={round.scoreDeltas[index] >= 0 ? "gain" : "loss"}>
                    {scoreText(round.scoreDeltas[index])}
                  </strong>
                </div>
              ))}
            </div>
            <div className="result-multiplier">本局最终倍数 ×{round.multiplier}</div>
            <button type="button" className="review-cards" onClick={() => { setReviewing(true); setShowResult(false); }}>再看看剩余手牌</button>
            <button type="button" className="primary next-round" onClick={() => setData(startNextRound(data))}>
              再来一局
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
