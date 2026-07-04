import { useDiscordSDK } from './hooks/useDiscordSDK';
import { GameProvider, useGame } from './context/GameContext';
import { Lobby } from './components/Lobby';
import { Playing } from './components/Playing';
import { GameEnded } from './components/GameEnded';
import './App.css';

function GameContent() {
  const { gameState, currentUserId, isConnected } = useGame();

  if (!isConnected) {
    return (
      <div className="loading">
        <p>Conectando...</p>
      </div>
    );
  }

  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);

  return (
    <div className="app">
      <header className="game-header">
        <div className="header-top">
          <span className="round-badge">Ronda {gameState.roundNumber}</span>
          <span className="player-count">{gameState.players.length} jugadores</span>
        </div>
        {gameState.players.length > 0 && (
          <div className="header-scores">
            {sortedPlayers.map((p, i) => (
              <span key={p.id} className={`header-score-item${p.id === currentUserId ? ' me' : ''}`}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}
                {p.username}: <strong>{p.score}</strong>
              </span>
            ))}
          </div>
        )}
      </header>
      <main className="game-main">
        {gameState.phase === 'lobby' && <Lobby />}
        {(gameState.phase === 'playing' || gameState.phase === 'sudden_death') && <Playing />}
        {gameState.phase === 'ended' && <GameEnded />}
      </main>
    </div>
  );
}

export default function App() {
  const { roomId, userId, username, avatar } = useDiscordSDK();

  return (
    <GameProvider roomId={roomId} currentUserId={userId} currentUsername={username} currentAvatar={avatar}>
      <GameContent />
    </GameProvider>
  );
}
