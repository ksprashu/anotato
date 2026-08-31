import {
  Square,
  Circle,
  ArrowUpRight,
  MapPin,
  LucideIcon,
} from 'lucide-react';
import { AnnotationGeometry } from '../types';

export function formatTimestamp(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return '';
  const date = new Date(timestampMs);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface ShapeTypeMeta {
  label: string;
  icon: LucideIcon;
  badgeStyle: string;
}

export function getShapeTypeMeta(type: AnnotationGeometry['type']): ShapeTypeMeta {
  switch (type) {
    case 'box':
      return {
        label: 'Box',
        icon: Square,
        badgeStyle: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      };
    case 'ellipse':
      return {
        label: 'Circle',
        icon: Circle,
        badgeStyle: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      };
    case 'arrow':
      return {
        label: 'Arrow',
        icon: ArrowUpRight,
        badgeStyle: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      };
    case 'pin':
      return {
        label: 'Pin',
        icon: MapPin,
        badgeStyle: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      };
    default:
      return {
        label: 'Shape',
        icon: Square,
        badgeStyle: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      };
  }
}
