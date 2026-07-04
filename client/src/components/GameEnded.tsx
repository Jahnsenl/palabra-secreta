import { useGame } from '../context/GameContext';

export function GameEnded() {
  const { gameState, nextRound, resetGame } = useGame();

  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  const first = gameState.players.find(p => p.guessOrder === 1);
  const second = gameState.players.find(p => p.guessOrder === 2);

  return (
    <div className="game-ended">
      <h1>🏁 Ronda terminada</h1>

      <div className="word-reveal">
        <p>La palabra era:</p>
        <h2 className="revealed-word">{gameState.secretWord ?? '?'}</h2>
      </div>

      <div className="round-result">
        {first ? (
          <>
            <div className="result-row first">
              🥇 <strong>{first.username}</strong> adivinó primero
              <span className="pts">+{second ? 5 : 6} pts</span>
            </div>
            {second && (
              <div className="result-row second">
                🥈 <strong>{second.username}</strong> adivinó segundo
                <span className="pts">+3 pts</span>
              </div>
            )}
            {!second && (
              <div className="result-row bonus">
                ⭐ Único acertante — bonus +1 incluido
              </div>
            )}
          </>
        ) : (
          <div className="result-row none">
            😅 Nadie adivinó la palabra esta ronda
          </div>
        )}
      </div>

      <div className="scores">
        <h2>Puntuación total</h2>
        <table>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id} className={p.guessOrder === 1 ? 'winner-row' : ''}>
                <td className="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</td>
                <td className="player-name">
                  {p.avatar && <img src={p.avatar} alt="" className="score-avatar" />}
                  {p.username}
                </td>
                <td className="player-score"><strong>{p.score}</strong> pts</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="end-actions">
        <button className="next-round-btn" onClick={nextRound}>
          Siguiente ronda
        </button>
        <button className="reset-btn" onClick={resetGame}>
          Nueva partida
        </button>
      </div>
    </div>
  );
}
