import { createContext, useContext } from 'react';
import type { HostTheme } from '../host-theme';

/** The Cribl shell's theme, for components that need it as a prop (e.g. EmptyState art). */
export const ThemeContext = createContext<HostTheme>('light');
export const useHostTheme = () => useContext(ThemeContext);
