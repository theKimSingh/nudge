import { createContext, type ReactNode, useContext } from 'react';
import type { ColorSchemeName } from 'react-native';

const ColorSchemeOverrideContext = createContext<ColorSchemeName | undefined>(undefined);

export function ColorSchemeOverride({
  value,
  children,
}: {
  value: ColorSchemeName;
  children: ReactNode;
}) {
  return (
    <ColorSchemeOverrideContext.Provider value={value}>
      {children}
    </ColorSchemeOverrideContext.Provider>
  );
}

export function useColorSchemeOverride() {
  return useContext(ColorSchemeOverrideContext);
}
