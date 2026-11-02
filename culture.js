// Cultural adaptation: greetings in the player's language and formality, and a matching gesture.
const period = clock => (clock < 720 ? 0 : clock < 1080 ? 1 : 2); // morning, afternoon, evening (clock = game minutes)

const G = {
  en: { casual: ['Hi there!', 'Hi there!', 'Hi there!'], formal: ['Good morning, welcome to the Funfair.', 'Good afternoon, welcome to the Funfair.', 'Good evening, welcome to the Funfair.'], bye: 'Enjoy your visit!' },
  es: { casual: ['¡Hola!', '¡Hola!', '¡Hola!'], formal: ['Buenos días, bienvenido al parque.', 'Buenas tardes, bienvenido al parque.', 'Buenas noches, bienvenido al parque.'], bye: '¡Que disfrute!' },
  fr: { casual: ['Salut !', 'Salut !', 'Salut !'], formal: ['Bonjour, bienvenue au parc.', 'Bonjour, bienvenue au parc.', 'Bonsoir, bienvenue au parc.'], bye: 'Bonne visite !' },
  pt: { casual: ['Oi!', 'Oi!', 'Oi!'], formal: ['Bom dia, bem-vindo ao parque.', 'Boa tarde, bem-vindo ao parque.', 'Boa noite, bem-vindo ao parque.'], bye: 'Aproveite!' },
  ja: { casual: ['やあ！', 'やあ！', 'やあ！'], formal: ['おはようございます。ようこそ。', 'こんにちは。ようこそ。', 'こんばんは。ようこそ。'], bye: 'ごゆっくりどうぞ。' },
  hi: { casual: ['नमस्ते!', 'नमस्ते!', 'नमस्ते!'], formal: ['नमस्ते, पार्क में आपका स्वागत है।', 'नमस्ते, पार्क में आपका स्वागत है।', 'नमस्ते, पार्क में आपका स्वागत है।'], bye: 'आनंद लीजिए!' }
};
export const LANGS = Object.keys(G);

export const greeting = (lang, formal, clock) => (G[lang] || G.en)[formal === 'formal' ? 'formal' : 'casual'][period(clock)];
export const farewell = lang => (G[lang] || G.en).bye;

// NPCs mirror the player's greeting style: a bow is answered with a bow, and so on.
// Formal guests are answered with a bow or nod rather than a wave.
export const reply = (culture, formal) => (['bow', 'namaste', 'handshake', 'nod', 'wave'].includes(culture) ? (culture === 'wave' && formal === 'formal' ? 'nod' : culture) : 'wave');

// Preferred minimum distance (m) that non-urgent NPCs keep from a player.
export const SPACE = { close: 0.9, normal: 1.5, wide: 2.4 };
