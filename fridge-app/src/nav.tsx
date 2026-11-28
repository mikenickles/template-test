import { createContext, useContext } from 'react';
import type { AppData } from './data';
import type { Tab } from './voice';

export type FoodView = 'meals' | 'groceries';
export interface Nav {
  tab: Tab;
  food: FoodView;
  go(tab: Tab, food?: FoodView): void;
  setFood(v: FoodView): void;
  toast(message: string, undo?: AppData): void;
  openVoice(): void;
}
export const NavCtx = createContext<Nav | null>(null);
export function useNav() {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav outside provider');
  return n;
}
export const TABS: Tab[] = ['home', 'stock', 'calendar', 'tasks', 'food'];
