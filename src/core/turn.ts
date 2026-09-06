// Seats are laid out as: human at the bottom, player 1 on the left and
// player 2 on the right. Counterclockwise play therefore moves 0 -> 2 -> 1.
export function nextPlayerIndex(index: number): number {
  return (index + 2) % 3;
}

export function previousPlayerIndex(index: number): number {
  return (index + 1) % 3;
}
