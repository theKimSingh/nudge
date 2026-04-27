import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useColorSchemeOverride } from './color-scheme-override';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const override = useColorSchemeOverride();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (override) {
    return override;
  }

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
