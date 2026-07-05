import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { WORDS } from './words';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(express.json());
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});
app.options('*', (_req, res) => res.status(204).end());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/token', async (req, res) => {
  const { code } = req.body;
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? '',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code,
      }).toString(),
    });
    const data = await response.json() as { access_token?: string; error?: string };
    if (!response.ok || !data.access_token) {
      res.status(400).json({ error: data.error ?? 'token_error' });
      return;
    }
    res.json({ access_token: data.access_token });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'lobby' | 'playing' | 'sudden_death' | 'ended';
type Difficulty = 'easy' | 'normal' | 'hard' | 'extreme';
type LetterResult = 'correct' | 'present' | 'absent';

interface PlayerAttempt {
  word: string;
  results: LetterResult[];
}

interface Player {
  id: string;
  username: string;
  avatar: string;
  socketId: string;
  score: number;
  secretLetter: string;
  secretLetterIndex: number;
  attempts: PlayerAttempt[];
  hasGuessed: boolean;
  guessOrder?: number;
  attemptsLeft: number;
  usedSuddenDeath: boolean;
}

interface GameState {
  phase: GamePhase;
  players: Player[];
  wordLength: number;
  difficulty: Difficulty;
  isCooperative: boolean;
  isTraitor: boolean;
  category?: string;
  startHint?: string;
  maxAttempts: number;
  cooperativeAttemptsLeft?: number;
  suddenDeathStartTime?: number;
  roundNumber: number;
  secretWord?: string;
  revealedHint?: string;
  firstGuesserName?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function uniqueLetters(word: string): string[] {
  return [...new Set(normalize(word).split(''))];
}

function getWordleFeedback(secret: string, attempt: string): LetterResult[] {
  const sNorm = normalize(secret).split('');
  const aNorm = normalize(attempt).split('');
  const result: LetterResult[] = new Array(secret.length).fill('absent');
  const remaining = [...sNorm];

  for (let i = 0; i < sNorm.length; i++) {
    if (aNorm[i] === sNorm[i]) {
      result[i] = 'correct';
      remaining[i] = '';
    }
  }
  for (let i = 0; i < sNorm.length; i++) {
    if (result[i] === 'correct') continue;
    const idx = remaining.indexOf(aNorm[i]);
    if (idx !== -1) {
      result[i] = 'present';
      remaining[idx] = '';
    }
  }
  return result;
}

// ── Room store ────────────────────────────────────────────────────────────────

const rooms = new Map<string, GameState>();
const secretWords = new Map<string, string>();

function createRoom(): GameState {
  return {
    phase: 'lobby',
    players: [],
    wordLength: 0,
    difficulty: 'normal',
    isCooperative: false,
    isTraitor: false,
    maxAttempts: 0,
    roundNumber: 1,
  };
}

function getRoom(roomId: string): GameState {
  if (!rooms.has(roomId)) rooms.set(roomId, createRoom());
  return rooms.get(roomId)!;
}

function broadcast(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const secret = secretWords.get(roomId);
  const hideLetters = room.difficulty === 'extreme';

  const safeState = {
    ...room,
    players: room.players.map(p => ({
      ...p,
      secretLetter: hideLetters ? undefined : p.secretLetter,
      secretLetterIndex: undefined,
      socketId: undefined,
    })),
    secretWord: room.phase === 'ended' ? secret : undefined,
  };

  io.to(roomId).emit('game_state', safeState);
}

function sendPrivateInfo(socket: Socket, player: Player) {
  socket.emit('private_info', { secretLetter: player.secretLetter });
}

const suddenDeathTimers = new Map<string, ReturnType<typeof setTimeout>>();

function endGame(roomId: string) {
  const room = getRoom(roomId);
  if (room.phase === 'ended') return;

  const t = suddenDeathTimers.get(roomId);
  if (t) clearTimeout(t);
  suddenDeathTimers.delete(roomId);

  const guessers = room.players
    .filter(p => p.hasGuessed && p.guessOrder !== undefined)
    .sort((a, b) => (a.guessOrder ?? 99) - (b.guessOrder ?? 99));

  const first = guessers[0];
  const second = guessers[1];
  if (first) first.score += second ? 5 : 6;
  if (second) second.score += 3;

  room.phase = 'ended';
  broadcast(roomId);
}

// ── Socket handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {

  socket.on('join_room', ({ roomId, userId, username, avatar }: {
    roomId: string; userId: string; username: string; avatar: string;
  }) => {
    socket.join(roomId);
    const room = getRoom(roomId);

    const existing = room.players.find(p => p.id === userId);
    if (existing) {
      existing.socketId = socket.id;
      if (room.phase === 'playing' || room.phase === 'sudden_death') {
        sendPrivateInfo(socket, existing);
      }
    } else if (room.phase === 'lobby' && room.players.length < 6) {
      room.players.push({
        id: userId, username, avatar: avatar ?? '',
        socketId: socket.id, score: 0,
        secretLetter: '', secretLetterIndex: -1,
        attempts: [], hasGuessed: false,
        attemptsLeft: 0, usedSuddenDeath: false,
      });
    }

    broadcast(roomId);
  });

  socket.on('update_settings', ({ roomId, difficulty, isCooperative, isTraitor }: {
    roomId: string;
    difficulty?: Difficulty;
    isCooperative?: boolean;
    isTraitor?: boolean;
  }) => {
    const room = getRoom(roomId);
    if (room.phase !== 'lobby') return;
    if (difficulty !== undefined) room.difficulty = difficulty;
    if (isCooperative !== undefined) room.isCooperative = isCooperative;
    if (isTraitor !== undefined) room.isTraitor = isTraitor;
    broadcast(roomId);
  });

  socket.on('start_game', ({ roomId }: { roomId: string }) => {
    const room = getRoom(roomId);
    if (room.phase !== 'lobby' || room.players.length < 2) return;

    const playerCount = room.players.length;
    const minLength = playerCount + 2;

    // En modo Fácil la palabra debe tener al menos tantas letras únicas como jugadores
    const validWords = WORDS.filter(w => {
      if (w.word.length < minLength) return false;
      if ((room.difficulty === 'easy' || room.difficulty === 'normal') && uniqueLetters(w.word).length < playerCount) return false;
      return true;
    });
    if (validWords.length === 0) return;

    const wordData = validWords[Math.floor(Math.random() * validWords.length)];
    const word = wordData.word;
    const wordLen = word.length;
    secretWords.set(roomId, word);

    const baseAttempts = wordLen - playerCount - 1;
    const maxAttempts = room.difficulty === 'easy'
      ? Math.max(2, Math.min(5, baseAttempts + 2))
      : room.difficulty === 'normal'
        ? Math.max(2, Math.min(5, baseAttempts + 1))
        : room.difficulty === 'hard'
          ? Math.max(2, Math.min(5, baseAttempts))
          : Math.max(2, Math.min(3, baseAttempts)); // extreme: máximo 3

    // Asignar posiciones
    let positions: number[];
    if (room.difficulty === 'easy' || room.difficulty === 'normal') {
      // En Fácil: cada jugador recibe una letra diferente (posiciones con letras únicas)
      const seenLetters = new Set<string>();
      const uniquePositions: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const norm = normalize(word[i]);
        if (!seenLetters.has(norm)) {
          seenLetters.add(norm);
          uniquePositions.push(i);
        }
      }
      positions = uniquePositions.sort(() => Math.random() - 0.5).slice(0, playerCount);
    } else {
      // En el resto: posiciones aleatorias (pueden coincidir en letra)
      positions = Array.from({ length: word.length }, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, playerCount);
    }

    // Traidor: un jugador aleatorio recibe una letra falsa
    const traitorIdx = room.isTraitor ? Math.floor(Math.random() * playerCount) : -1;
    const wordNorm = normalize(word).split('');
    const alphabet = 'bcdfghjklmnpqrstvwxyz'.split('');
    const fakePool = alphabet.filter(c => !wordNorm.includes(c));

    room.players = room.players.map((p, i) => {
      const pos = positions[i];
      let letter = word[pos].toUpperCase();

      if (i === traitorIdx && fakePool.length > 0) {
        letter = fakePool[Math.floor(Math.random() * fakePool.length)].toUpperCase();
      }

      return {
        ...p,
        secretLetter: letter,
        secretLetterIndex: pos,
        attempts: [],
        hasGuessed: false,
        guessOrder: undefined,
        attemptsLeft: maxAttempts,
        usedSuddenDeath: false,
      };
    });

    room.wordLength = wordLen;
    room.maxAttempts = maxAttempts;
    room.category = wordData.category;
    room.startHint = (room.difficulty === 'easy' || room.difficulty === 'normal') ? wordData.hints[0] : undefined;
    room.phase = 'playing';
    room.suddenDeathStartTime = undefined;
    room.revealedHint = undefined;
    room.firstGuesserName = undefined;
    room.cooperativeAttemptsLeft = room.isCooperative ? maxAttempts : undefined;

    room.players.forEach(player => {
      const s = io.sockets.sockets.get(player.socketId);
      if (s) sendPrivateInfo(s, player);
    });

    broadcast(roomId);
  });

  socket.on('submit_attempt', ({ roomId, userId, word: attemptWord }: {
    roomId: string; userId: string; word: string;
  }) => {
    const room = getRoom(roomId);
    if (room.phase !== 'playing' && room.phase !== 'sudden_death') return;

    const player = room.players.find(p => p.id === userId);
    if (!player || player.hasGuessed) return;

    const secret = secretWords.get(roomId)!;
    if (!secret || normalize(attemptWord).length !== normalize(secret).length) {
      socket.emit('attempt_rejected', { reason: 'wrong_length' });
      return;
    }

    if (room.phase === 'sudden_death') {
      if (player.usedSuddenDeath) return;
      player.usedSuddenDeath = true;
    } else {
      if (room.isCooperative) {
        if ((room.cooperativeAttemptsLeft ?? 0) <= 0) return;
        room.cooperativeAttemptsLeft = (room.cooperativeAttemptsLeft ?? 0) - 1;
      } else {
        if (player.attemptsLeft <= 0) return;
        player.attemptsLeft--;
      }
    }

    const results = getWordleFeedback(secret, attemptWord);
    player.attempts.push({ word: attemptWord.toUpperCase(), results });

    const isCorrect = normalize(attemptWord) === normalize(secret);

    if (isCorrect) {
      const guessedSoFar = room.players.filter(p => p.hasGuessed).length;
      player.hasGuessed = true;
      player.guessOrder = guessedSoFar + 1;

      if (player.guessOrder === 1) {
        room.firstGuesserName = player.username;

        const wordData = WORDS.find(w => normalize(w.word) === normalize(secret));
        if (wordData) {
          const others = wordData.hints.filter((_, i) => i > 0);
          room.revealedHint = others.length > 0
            ? others[Math.floor(Math.random() * others.length)]
            : wordData.hints[0];
        }

        const unguessed = room.players.filter(p => !p.hasGuessed);
        if (unguessed.length === 0) { endGame(roomId); return; }

        room.phase = 'sudden_death';
        room.suddenDeathStartTime = Date.now();
        const timer = setTimeout(() => endGame(roomId), 15000);
        suddenDeathTimers.set(roomId, timer);
      } else {
        endGame(roomId);
        return;
      }
    } else if (room.phase === 'playing') {
      const allDone = room.players.every(p =>
        p.hasGuessed || (room.isCooperative
          ? (room.cooperativeAttemptsLeft ?? 0) <= 0
          : p.attemptsLeft <= 0)
      );
      if (allDone) { endGame(roomId); return; }
    } else if (room.phase === 'sudden_death') {
      const allUsed = room.players.filter(p => !p.hasGuessed).every(p => p.usedSuddenDeath);
      if (allUsed) { endGame(roomId); return; }
    }

    broadcast(roomId);
  });

  socket.on('next_round', ({ roomId }: { roomId: string }) => {
    const room = getRoom(roomId);
    if (room.phase !== 'ended') return;

    const scores = Object.fromEntries(room.players.map(p => [p.id, p.score]));
    const fresh = createRoom();
    fresh.players = room.players.map(p => ({
      ...p,
      secretLetter: '', secretLetterIndex: -1,
      attempts: [], hasGuessed: false, guessOrder: undefined,
      attemptsLeft: 0, usedSuddenDeath: false,
      score: scores[p.id] ?? 0,
    }));
    fresh.roundNumber = room.roundNumber + 1;
    fresh.difficulty = room.difficulty;
    fresh.isCooperative = room.isCooperative;
    fresh.isTraitor = room.isTraitor;
    rooms.set(roomId, fresh);
    broadcast(roomId);
  });

  socket.on('reset_game', ({ roomId }: { roomId: string }) => {
    const t = suddenDeathTimers.get(roomId);
    if (t) clearTimeout(t);
    suddenDeathTimers.delete(roomId);
    const room = getRoom(roomId);
    const fresh = createRoom();
    fresh.players = room.players.map(p => ({
      ...p,
      secretLetter: '', secretLetterIndex: -1,
      attempts: [], hasGuessed: false, guessOrder: undefined,
      attemptsLeft: 0, usedSuddenDeath: false,
      score: 0,
    }));
    rooms.set(roomId, fresh);
    broadcast(roomId);
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      const idx = room.players.findIndex(p => p.socketId === socket.id);
      if (idx === -1) return;
      if (room.phase === 'lobby') {
        room.players.splice(idx, 1);
        broadcast(roomId);
      } else if (room.phase === 'sudden_death') {
        const player = room.players[idx];
        if (!player.hasGuessed && !player.usedSuddenDeath) {
          player.usedSuddenDeath = true;
          const allUsed = room.players.filter(p => !p.hasGuessed).every(p => p.usedSuddenDeath);
          if (allUsed) { endGame(roomId); } else { broadcast(roomId); }
        }
      }
    });
  });
});

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => console.log(`Palabra Secreta server running on :${PORT}`));
