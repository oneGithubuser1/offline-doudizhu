import { type Card, RANK_LABEL, SUIT_SYMBOL } from "../core/cards";

interface PlayingCardProps {
  card: Card;
  selected?: boolean;
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ card, selected, small, disabled, onClick }: PlayingCardProps) {
  const red = card.suit === "heart" || card.suit === "diamond" || card.rank === 17;
  const joker = card.rank >= 16;
  const rankLabel = RANK_LABEL[card.rank];
  const suitSymbol = SUIT_SYMBOL[card.suit];
  return (
    <button
      type="button"
      className={`playing-card ${selected ? "selected" : ""} ${small ? "small" : ""} ${joker ? "joker" : ""}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={`${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`}
    >
      {joker ? (
        <span className={`joker-face ${red ? "red" : "black"}`}>
          <b className="joker-word">JOKER</b>
          <svg className="joker-art" viewBox="0 0 60 76" aria-hidden="true">
            <path d="M14 35 7 15l18 11 7-20 7 20 15-12-7 22z" fill="currentColor" opacity=".9" />
            <g fill="currentColor"><circle cx="7" cy="12" r="3"/><circle cx="32" cy="4" r="3"/><circle cx="55" cy="11" r="3"/></g>
            <path d="M18 37h27v14c0 10-10 15-14 15s-13-6-13-15z" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="m22 45 5 2m8 0 5-2m-14 10q5 5 10 0M20 66l11 6 12-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
      ) : (
        <>
          <span className={`card-corner card-corner-top ${red ? "red" : "black"}`}>
            <b>{rankLabel}</b>
            <i>{suitSymbol}</i>
          </span>
          <span className={`card-center ${red ? "red" : "black"}`}>{suitSymbol}</span>
          {!small && (
            <span className={`card-corner card-corner-bottom ${red ? "red" : "black"}`}>
              <b>{rankLabel}</b>
              <i>{suitSymbol}</i>
            </span>
          )}
        </>
      )}
    </button>
  );
}
