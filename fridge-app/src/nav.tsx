import { createContext, useContext } from 'react';
import type { AppData } from './data';
import type { Tab } from './voice';

export interface Nav {
  tab: Tab;
  go(tab: Tab): void;
  toast(message: string, undo?: AppData): void;
  openVoice(): void;
  openMenu(): void;
}
export const NavCtx = createContext<Nav | null>(null);
export function useNav() {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav outside provider');
  return n;
}
/** Order of sections in the menu (used for slide direction). */
export const TABS: Tab[] = ['home', 'stock', 'calendar', 'tasks', 'groceries', 'meals', 'settings'];
