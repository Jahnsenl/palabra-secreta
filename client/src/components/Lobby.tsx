import { useGame, type Difficulty } from '../context/GameContext';

const PLAYER_EMOJIS = ['👑', '🤖', '🧙‍♂️', '🕵️', '🦊', '🐺'];
const MAX_PLAYERS = 6;

const DIFFICULTIES: { value: Difficulty; label: string; desc: string }[] = [
  { value: 'easy',    label: 'Fácil',   desc: 'Longitud + categoría + pista · letras únicas' },
  { value: 'normal',  label: 'Normal',  desc: 'Longitud + pista · letras únicas' },
  { value: 'hard',    label: 'Difícil', desc: 'Longitud · sin pistas · letras pueden repetirse' },
  { value: 'extreme', label: 'Extremo', desc: 'Sin pistas · sin ver letras ajenas' },
];

export function Lobby() {
  const { gameState, startGame, updateSettings } = useGame();
  const canStart = gameState.players.length >= 2;

  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    player: gameState.players[i] || null,
    emoji: PLAYER_EMOJIS[i],
    slot: i + 1,
  }));

  return (
    <div className="lobby">
      <h1>🔤 Palabra Secreta</h1>
      <p className="subtitle">Descubre la palabra antes que los demás</p>

      <div className="section">
        <h2>Jugadores ({gameState.players.length}/{MAX_PLAYERS})</h2>
        <ul className="player-slots">
          {slots.map(({ player, emoji, slot }) => (
            <li key={slot} className={player ? 'slot filled' : 'slot empty'}>
              {player?.avatar
                ? <img src={player.avatar} alt={player.username} className="slot-avatar" />
                : <span className="slot-emoji">{emoji}</span>}
              <span className="slot-name">
                {player ? player.username : `Jugador ${slot}`}
              </span>
              {player && <span className="slot-score">{player.score} pts</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="section">
        <h2>Dificultad</h2>
        <div className="difficulty-grid">
          {DIFFICULTIES.map(({ value, label, desc }) => (
            <button
              key={value}
              className={`difficulty-btn${gameState.difficulty === value ? ' active' : ''}`}
              onClick={() => updateSettings({ difficulty: value })}
            >
              <span className="diff-label">{label}</span>
              <span className="diff-desc">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Modos extra</h2>
        <div className="modes-row">
          <button
            className={`mode-toggle${gameState.isCooperative ? ' active' : ''}`}
            onClick={() => updateSettings({ isCooperative: !gameState.isCooperative })}
          >
            <span className="mode-icon">🤝</span>
            <span className="mode-label">Cooperativo</span>
            <span className="mode-state">{gameState.isCooperative ? 'ON' : 'OFF'}</span>
          </button>
          <button
            className={`mode-toggle${gameState.isTraitor ? ' active' : ''}`}
            onClick={() => updateSettings({ isTraitor: !gameState.isTraitor })}
          >
            <span className="mode-icon">🗡️</span>
            <span className="mode-label">Traidor</span>
            <span className="mode-state">{gameState.isTraitor ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        {gameState.isCooperative && (
          <p className="mode-hint">Tablero compartido · cada jugador escribe una letra por turno (10s)</p>
        )}
        {gameState.isTraitor && (
          <p className="mode-hint">Un jugador recibirá una letra falsa sin saberlo</p>
        )}
      </div>

      <div className="lobby-info">
        <p>📏 Longitud mínima: <strong>{gameState.players.length + 2}</strong> letras</p>
        <p>🔢 Intentos: <strong>longitud − jugadores − 1</strong> (mín. 2, máx. 5)</p>
      </div>

      <button className="start-button" onClick={startGame} disabled={!canStart}>
        {canStart
          ? 'Comenzar partida'
          : `Necesitas ${2 - gameState.players.length} jugador${2 - gameState.players.length !== 1 ? 'es' : ''} más`}
      </button>
    </div>
  );
}
