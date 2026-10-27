// Responsive Components Export
// Mobile-first responsive components for POS system

// Navigation Components
export { default as MobileBottomNav } from '../layout/MobileBottomNav';

// Menu Components
export { default as MenuItemCard } from '../menu/MenuItemCard';

// Cart Components
export { default as FloatingCartButton } from '../cart/FloatingCartButton';
export { default as MinimalCartDrawer } from '../cart/MinimalCartDrawer';

// Responsive Utilities
export const BREAKPOINTS = {
  mobile: '480px',    // Mobile phones (portrait)
  tablet: '768px',    // Tablets (portrait)
  desktop: '1024px',  // Tablets (landscape) / Small laptops
  xl: '1280px',       // Desktop / Large tablets
  '2xl': '1536px',    // Large desktop
};

// Responsive design patterns for POS system
export const RESPONSIVE_PATTERNS = {
  // Hide on mobile, show on desktop
  DESKTOP_ONLY: { base: 'none', lg: 'block' },

  // Show on mobile, hide on desktop
  MOBILE_ONLY: { base: 'block', lg: 'none' },

  // Responsive spacing
  SPACING: {
    container: { base: 2, md: 4, lg: 6 },
    section: { base: 4, md: 6, lg: 8 },
    component: { base: 2, md: 3, lg: 4 },
  },

  // Responsive text sizes
  TEXT_SIZES: {
    heading: { base: 'xl', md: '2xl', lg: '3xl' },
    subheading: { base: 'lg', md: 'xl', lg: '2xl' },
    body: { base: 'sm', md: 'md', lg: 'lg' },
  },

  // Responsive grid columns
  GRID_COLUMNS: {
    menu: {
      base: '1fr',
      md: 'repeat(2, 1fr)',
      lg: 'repeat(2, 1fr)',
      xl: 'repeat(3, 1fr)',
    },
    tables: {
      base: '1fr',
      sm: 'repeat(2, 1fr)',
      md: 'repeat(3, 1fr)',
      lg: 'repeat(4, 1fr)',
      xl: 'repeat(5, 1fr)',
    },
  },
};
