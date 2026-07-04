import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { useGame, type LetterResult } from '../context/GameContext';

function LetterBox({ char, result }: { char: string; result?: LetterResult }) {
  const cls = result === 'correct' ? 'tile green'
    : result === 'present' ? 'tile yellow'
    : result === 'absent' ? 'tile gray'
    : 'tile empty';
  return <span className={cls}>{char || ''}</span>;
}

function WordGrid({ attempts, wordLength, currentInput }: {
  attempts: { word: string; results: LetterResult[] }[];
  wordLength: number;
  currentInput: string;
}) {
  return (
    <div className="word-grid">
      {attempts.map((attempt, i) => (
        <div key={i} className="grid-row">
          {Array.from({ length: wordLength }, (_, j) => (
            <LetterBox key={j} char={attempt.word[j] ?? ''} result={attempt.results[j]} />
          ))}
        </div>
      ))}
      {/* current input row */}
      <div className="grid-row current">
        {Array.from({ length: wordLength }, (_, j) => (
          <LetterBox key={j} char={currentInput[j] ?? ''} />
        ))}
      </div>
    </div>
  );
}

function SuddenDeathTimer({ startTime }: { startTime: number }) {
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    const calc = () => Math.max(0, 15 - Math.floor((Date.now() - startTime) / 1000));
    setTimeLeft(calc());
    const id = setInterval(() => setTimeLeft(calc()), 500);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <div className={`sudden-timer ${timeLeft <= 5 ? 'danger' : timeLeft <= 10 ? 'warning' : ''}`}>
      {timeLeft}s
    </div>
  );
}

export function Playing() {
  const { gameState, currentUserId, privateInfo, submitAttempt } = useGame();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPlayer = gameState.players.find(p => p.id === currentUserId);
  const isSuddenDeath = gameState.phase === 'sudden_death';
  const myLetter = privateInfo?.secretLetter ?? currentPlayer?.secretLetter ?? '?';

  const canAttempt = currentPlayer && !currentPlayer.hasGuessed && (
    isSuddenDeath
      ? !currentPlayer.usedSuddenDeath
      : currentPlayer.attemptsLeft > 0
  );

  const showLength = gameState.difficulty === 'easy' || gameState.difficulty === 'normal';
  const showCategory = gameState.difficulty === 'easy';
  const showOtherLetters = gameState.difficulty !== 'extreme';

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSubmit();
  }

  function handleSubmit() {
    const normalized = input.trim().toUpperCase();
    if (normalized.length !== gameState.wordLength) return;
    submitAttempt(normalized);
    setInput('');
    inputRef.current?.focus();
  }

  const others = gameState.players.filter(p => p.id !== currentUserId);

  return (
    <div className="playing">
      {/* Sudden death banner */}
      {isSuddenDeath && gameState.suddenDeathStartTime && (
        <div className="sudden-death-banner">
          <p>🎯 <strong>{gameState.firstGuesserName}</strong> ha adivinado!</p>
          {gameState.revealedHint && (
            <p className="extra-hint">Pista extra: <strong>{gameState.revealedHint}</strong></p>
          )}
          <SuddenDeathTimer startTime={gameState.suddenDeathStartTime} />
          {currentPlayer?.hasGuessed && (
            <p className="already-guessed">✅ Ya adivinaste</p>
          )}
        </div>
      )}

      {/* Word info */}
      <div className="word-info">
        {showLength && (
          <span className="info-badge">📏 {gameState.wordLength} letras</span>
        )}
        {showCategory && gameState.category && (
          <span className="info-badge">🏷️ {gameState.category}</span>
        )}
        <span className="info-badge">🔢 Ronda {gameState.roundNumber}</span>
      </div>

      {/* My letter */}
      <div className="my-letter-card">
        <p>Tu letra secreta</p>
        <span className="my-letter">{myLetter}</span>
      </div>

      {/* Other players' letters */}
      {showOtherLetters && others.length > 0 && (
        <div className="others-letters">
          <p>Letras de los demás:</p>
          <div className="others-row">
            {others.map(p => (
              <div key={p.id} className={`other-letter-item${p.hasGuessed ? ' guessed' : ''}`}>
                <span className="other-name">{p.username.slice(0, 6)}</span>
                <span className="other-letter">{p.secretLetter ?? '?'}{p.hasGuessed ? ' ✅' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Word grid for current player */}
      {currentPlayer && (
        <div className="my-grid">
          <WordGrid
            attempts={currentPlayer.attempts}
            wordLength={gameState.wordLength}
            currentInput={input}
          />
        </div>
      )}

      {/* Other players' grids (compact) */}
      {others.length > 0 && (
        <div className="others-grids">
          {others.map(p => (
            <div key={p.id} className="other-grid-wrap">
              <p className="other-grid-name">{p.username}{p.hasGuessed ? ' ✅' : ''}</p>
              <div className="other-grid">
                {p.attempts.map((att, i) => (
                  <div key={i} className="other-grid-row">
                    {att.results.map((r, j) => (
                      <span
                        key={j}
                        className={`tile-mini ${r === 'correct' ? 'green' : r === 'present' ? 'yellow' : 'gray'}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      {canAttempt && (
        <div className="attempt-input-wrap">
          <input
            ref={inputRef}
            className="attempt-input"
            type="text"
            value={input}
            maxLength={gameState.wordLength}
            placeholder={`Escribe ${gameState.wordLength} letras...`}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={input.trim().length !== gameState.wordLength}
          >
            Enviar
          </button>
          {!isSuddenDeath && currentPlayer && (
            <p className="attempts-left">
              {currentPlayer.attemptsLeft} intento{currentPlayer.attemptsLeft !== 1 ? 's' : ''} restante{currentPlayer.attemptsLeft !== 1 ? 's' : ''}
              {gameState.difficulty === 'cooperative' && gameState.cooperativeAttemptsLeft !== undefined && (
                <> · {gameState.cooperativeAttemptsLeft} compartidos</>
              )}
            </p>
          )}
          {isSuddenDeath && <p className="attempts-left">¡Último intento!</p>}
        </div>
      )}

      {currentPlayer?.hasGuessed && !isSuddenDeath && (
        <div className="waiting-others">
          <p>✅ ¡Adivinaste! Esperando a los demás...</p>
        </div>
      )}

      {!canAttempt && !currentPlayer?.hasGuessed && !isSuddenDeath && (
        <div className="no-attempts">
          <p>Sin intentos restantes. Espera el resultado.</p>
        </div>
      )}
    </div>
  );
}
