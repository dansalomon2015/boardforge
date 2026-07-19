type GameNightReturnProps = {
  gameNightCode: string | null;
};

export function GameNightReturn({ gameNightCode }: GameNightReturnProps) {
  return (
    <>
      {gameNightCode ? <small>Global score saved · returning automatically</small> : null}
      <a href={gameNightCode ? `/game-night/${gameNightCode}?returned=1` : "/"}>
        {gameNightCode ? "See the night standings" : "Back to the collection"} <b>→</b>
      </a>
    </>
  );
}
