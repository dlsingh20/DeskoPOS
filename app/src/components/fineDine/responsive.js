import { useBreakpointValue } from '@chakra-ui/react';

/**
 * Responsive helpers for the Fine Dine screens. Layout follows the theme breakpoints and the
 * pointer type, never a fixed screen resolution.
 */

/** Finger-sized controls on touch screens (tablets, touch laptops), whatever the screen size. Spread into `sx`. */
export const TOUCH_TARGETS = {
  '@media (pointer: coarse)': {
    button: { minHeight: '36px' },
    // Icon-only buttons (quantity +/-, card quick actions) get a square target too
    'button[aria-label]': { minWidth: '36px' },
    'input, select': { minHeight: '40px' },
  },
};

/** A dialog's size: full screen on phones, `size` from tablets up */
export const useDialogSize = (size) => useBreakpointValue({ base: 'full', md: size }, { fallback: 'md' });

/** ModalContent props that go with useDialogSize: square edges when full screen, touch-sized controls */
export const DIALOG_CONTENT = { borderRadius: { base: 0, md: '16px' }, sx: TOUCH_TARGETS };
