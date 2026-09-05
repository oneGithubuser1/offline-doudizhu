import { createDeck, sortCards } from "../core/cards";
import { createNewSave, type SaveData } from "../core/game";
import { classifyPlay } from "../core/patterns";

// Development-only visual fixtures; never read or write the player's save.
export function previewSave(scene: string): SaveData {
  const save = createNewSave(() => .42);
  const deck = createDeck();
  save.round.players[0].hand = sortCards([...deck.slice(0, 14), ...deck.slice(48)]);
  save.round.players[1].hand = sortCards(deck.slice(14, 31));
  save.round.players[2].hand = sortCards(deck.slice(31, 48));
  save.round.phase = "playing";
  save.round.currentPlayerIndex = 0;
  save.round.landlordIndex = 0;
  save.round.highestBid = 3;
  save.round.multiplier = 3;
  save.round.bottomRevealed = true;
  save.round.bottomCards = deck.slice(-3);
  save.round.players.forEach((player, i) => { player.role = i === 0 ? "landlord" : "farmer"; });
  save.settings.cardCounter = true;
  save.settings.sound = false;
  save.settings.voice = false;
  if (scene === "live") {
    save.round.players[0].hand = [deck.find(card => card.rank === 4)!];
    save.round.players[1].hand = [deck.find(card => card.rank === 3)!, ...deck.slice(-2)];
    save.round.players[2].hand = [deck.find(card => card.rank === 5)!];
    const held = new Set(save.round.players.flatMap(player => player.hand.map(card => card.id)));
    save.round.playedCards = deck.filter(card => !held.has(card.id));
    save.round.landlordIndex = 1;
    save.round.currentPlayerIndex = 1;
    save.round.bottomCards = [...save.round.players[1].hand];
    save.round.players.forEach((player, i) => { player.role = i === 1 ? "landlord" : "farmer"; });
  }
  if (scene === "rocket" || scene === "bomb") {
    const played = scene === "rocket" ? deck.slice(-2) : deck.slice(16, 20);
    save.round.lastPlay = { cards: played, pattern: classifyPlay(played)! };
    save.round.lastPlayBy = 1;
    save.round.players.forEach(player => { player.hand = player.hand.filter(card => !played.some(item => item.id === card.id)); });
    save.round.playedCards = played;
  }
  if (scene === "reveal" || scene === "reveal-loss") {
    save.round.phase = "finished";
    save.round.winnerTeam = "landlord";
    save.round.scoreDeltas = [6, -3, -3];
    save.round.players[0].hand = [];
    save.round.lastPlay = { cards: deck.slice(-2), pattern: classifyPlay(deck.slice(-2))! };
    save.round.lastPlayBy = 0;
    if (scene === "reveal-loss") {
      save.round.players[0].hand = sortCards([...deck.slice(0, 14), ...deck.slice(48)]);
      save.round.players[1].hand = [];
      save.round.winnerTeam = "farmers";
      save.round.scoreDeltas = [-6, 3, 3];
      save.round.lastPlay = { cards: deck.slice(16, 20), pattern: classifyPlay(deck.slice(16, 20))! };
      save.round.lastPlayBy = 1;
    }
  }
  return save;
}
