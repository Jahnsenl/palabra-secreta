import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';

// ── Types (mirrors server) ────────────────────────────────────────────────────

export type GamePhase = 'lobby' | 'playing' | 'sudden_death' | 'ended';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export type LetterResult = 'correct' | 'present' | 'absent';

export interface PlayerAttempt {
  word: string;
  results: LetterResult[];
}

export interface Player {
  id: string;
  username: string;
  avatar: string;
  score: number;
  secretLetter?: string;
  attempts: PlayerAttempt[];
  hasGuessed: boolean;
  guessOrder?: number;
  attemptsLeft: number;
  usedSuddenDeath: boolean;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  wordLength: number;
  difficulty: Difficulty;
  isCooperative: boolean;
  isTraitor: boolean;
  category?: string;
  maxAttempts: number;
  cooperativeAttemptsLeft?: number;
  suddenDeathStartTime?: number;
  roundNumber: number;
  secretWord?: string;
  revealedHint?: string;
  firstGuesserName?: string;
}

interface PrivateInfo {
  secretLetter: string;
}

interface Settings {
  difficulty?: Difficulty;
  isCooperative?: boolean;
  isTraitor?: boolean;
}

interface GameContextValue {
  gameState: GameState;
  currentUserId: string;
  privateInfo: PrivateInfo | null;
  isConnected: boolean;
  updateSettings: (settings: Settings) => void;
  startGame: () => void;
  submitAttempt: (word: string) => void;
  nextRound: () => void;
  resetGame: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const GameContext = createContext<GameContextValue | null>(null);

const SOCKET_URL = import.meta.env.VITE_SERVER_URL as string | undefined;

const defaultState: GameState = {
  phase: 'lobby',
  players: [],
  wordLength: 0,
  difficulty: 'normal',
  isCooperative: false,
  isTraitor: false,
  maxAttempts: 0,
  roundNumber: 1,
};

interface Props {
  roomId: string;
  currentUserId: string;
  currentUsername: string;
  currentAvatar: string;
  children: ReactNode;
}

export function GameProvider({ roomId, currentUserId, currentUsername, currentAvatar, children }: Props) {
  const [gameState, setGameState] = useState<GameState>(defaultState);
  const [privateInfo, setPrivateInfo] = useState<PrivateInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = SOCKET_URL
      ? io(SOCKET_URL)
      : io({ path: '/api/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join_room', {
        roomId,
        userId: currentUserId,
        username: currentUsername,
        avatar: currentAvatar,
      });
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('game_state', (state: GameState) => setGameState(state));
    socket.on('private_info', (info: PrivateInfo) => setPrivateInfo(info));

    return () => { socket.disconnect(); };
  }, [roomId, currentUserId, currentUsername, currentAvatar]);

  const emit = (event: string, data?: object) =>
    socketRef.current?.emit(event, { roomId, userId: currentUserId, ...data });

  const value: GameContextValue = {
    gameState,
    currentUserId,
    privateInfo,
    isConnected,
    updateSettings: (settings) => emit('update_settings', settings),
    startGame: () => emit('start_game'),
    submitAttempt: (word) => emit('submit_attempt', { word }),
    nextRound: () => emit('next_round'),
    resetGame: () => emit('reset_game'),
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
