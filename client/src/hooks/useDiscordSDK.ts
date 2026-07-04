import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = '1522642562198933524';

const isInDiscord =
  window.location.hostname.endsWith('.discordsays.com') ||
  (() => { try { return window.self !== window.top; } catch { return true; } })();

export function useDiscordSDK() {
  const [roomId, setRoomId] = useState('dev-room');

  const [userId, setUserId] = useState(() => {
    const s = sessionStorage.getItem('ps-userId');
    if (s) return s;
    const id = 'player-' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('ps-userId', id);
    return id;
  });

  const [username, setUsername] = useState(() => {
    const s = sessionStorage.getItem('ps-username');
    if (s) return s;
    const name = 'Jugador-' + Math.random().toString(36).slice(2, 5).toUpperCase();
    sessionStorage.setItem('ps-username', name);
    return name;
  });

  const [avatar, setAvatar] = useState('');

  useEffect(() => {
    if (!isInDiscord) return;

    let sdk: DiscordSDK;
    try {
      sdk = new DiscordSDK(CLIENT_ID);
      setRoomId(sdk.instanceId);
    } catch {
      return;
    }

    sdk.ready().then(async () => {
      try {
        const { code } = await sdk.commands.authorize({
          client_id: CLIENT_ID,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify'],
        });

        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) return;

        const { access_token } = await res.json() as { access_token: string };
        const auth = await sdk.commands.authenticate({ access_token });

        if (auth?.user) {
          const u = auth.user;
          const name = u.global_name ?? u.username ?? username;
          const uid = u.id ?? userId;
          setUserId(uid);
          setUsername(name);
          sessionStorage.setItem('ps-userId', uid);
          sessionStorage.setItem('ps-username', name);
          if (u.avatar) {
            setAvatar(`https://cdn.discordapp.com/avatars/${uid}/${u.avatar}.png`);
          }
        }
      } catch (e) {
        console.error('[Discord Auth]', e);
      }
    }).catch(e => console.error('[Discord ready]', e));
  }, []);

  return { roomId, userId, username, avatar };
}
