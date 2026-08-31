import { ColorDefinition, PresetColor } from '../types';

export const PRESET_COLORS: Record<PresetColor, ColorDefinition> = {
  red: {
    id: 'red',
    name: 'Red',
    hex: '#EF4444',
    stroke: '#EF4444',
    fill: 'rgba(239, 68, 68, 0.18)',
    badgeBg: '#EF4444',
    badgeText: '#FFFFFF',
  },
  amber: {
    id: 'amber',
    name: 'Potato Gold',
    hex: '#F59E0B',
    stroke: '#F59E0B',
    fill: 'rgba(245, 158, 11, 0.18)',
    badgeBg: '#F59E0B',
    badgeText: '#1E293B',
  },
  green: {
    id: 'green',
    name: 'Emerald Green',
    hex: '#10B981',
    stroke: '#10B981',
    fill: 'rgba(16, 185, 129, 0.18)',
    badgeBg: '#10B981',
    badgeText: '#FFFFFF',
  },
  cyan: {
    id: 'cyan',
    name: 'Electric Cyan',
    hex: '#06B6D4',
    stroke: '#06B6D4',
    fill: 'rgba(6, 182, 212, 0.18)',
    badgeBg: '#06B6D4',
    badgeText: '#FFFFFF',
  },
  purple: {
    id: 'purple',
    name: 'Vibrant Purple',
    hex: '#8B5CF6',
    stroke: '#8B5CF6',
    fill: 'rgba(139, 92, 246, 0.18)',
    badgeBg: '#8B5CF6',
    badgeText: '#FFFFFF',
  },
};

export const COLOR_KEYS: PresetColor[] = ['red', 'amber', 'green', 'cyan', 'purple'];
