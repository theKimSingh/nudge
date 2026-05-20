// Shared layout constants for the bottom-edge cluster: floating-tab-bar.tsx
// and floating-mic.tsx both derive their vertical position from these so
// the pill and the mic share an identical top edge, bottom edge, and
// vertical center.
//   bottom = insets.bottom + TAB_BAR_LIFT
//   height = TAB_BAR_HEIGHT
//
// HEIGHT 60 keeps the controls visually substantial. LIFT -10 dips the
// cluster 10pt into the safe-area inset (iOS tolerates this — there's
// slack before the home indicator), which lines up with where the iOS 26
// liquid-glass pills sit naturally.
export const TAB_BAR_HEIGHT = 60;
export const TAB_BAR_LIFT = -10;
