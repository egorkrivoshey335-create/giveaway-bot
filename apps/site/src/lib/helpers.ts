/**
 * Хелперы для рандомайзера
 */

/**
 * Возвращает эмодзи медали для места
 */
export function getMedal(place: number): string {
  switch (place) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return '🏅';
  }
}

/**
 * Возвращает цвет для места
 */
export function getPlaceColor(place: number): string {
  if (place === 1) return '#ffd700'; // золото
  if (place === 2) return '#c0c0c0'; // серебро
  if (place === 3) return '#cd7f32'; // бронза
  if (place <= 8) return '#7c3aed'; // фиолетовый
  if (place <= 19) return '#3b82f6'; // синий
  return '#10b981'; // зелёный
}

/**
 * Возвращает Tailwind градиент для места
 */
export function getPlaceGradient(place: number): string {
  if (place === 1) return 'from-yellow-400 to-amber-500';
  if (place === 2) return 'from-gray-300 to-gray-400';
  if (place === 3) return 'from-orange-400 to-orange-500';
  if (place <= 8) return 'from-purple-500 to-purple-600';
  if (place <= 19) return 'from-blue-500 to-blue-600';
  return 'from-green-500 to-green-600';
}

/**
 * Форматирует имя участника для отображения
 */
export function formatParticipantName(participant: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  telegramUserId?: string;
}): string {
  const fullName = `${participant.firstName || ''} ${participant.lastName || ''}`.trim();
  if (fullName) return fullName;
  if (participant.username) return `@${participant.username}`;
  if (participant.telegramUserId) return `User ${participant.telegramUserId.slice(-4)}`;
  return 'Участник';
}

/**
 * Пресеты цветов фона
 */
export const PRESET_BACKGROUNDS = [
  { label: 'Тёмный', value: '#0f0f23' },
  { label: 'Космос', value: '#1a1a2e' },
  { label: 'Тёмно-синий', value: '#16213e' },
  { label: 'Белый', value: '#ffffff' },
  { label: 'Розовый', value: '#fff0f0' },
  { label: 'Серый', value: '#f5f5f5' },
];

/**
 * Пресеты цветов акцента
 */
export const PRESET_ACCENTS = [
  '#f2b6b6', // розовый (бренд)
  '#e94560', // красный
  '#ffd700', // золотой
  '#00d2ff', // голубой
  '#7c3aed', // фиолетовый
  '#10b981', // зелёный
];

/**
 * Определяет светлый ли фон (для выбора цвета текста)
 */
export function isLightBackground(color: string): boolean {
  // Простая проверка по hex значению
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}
