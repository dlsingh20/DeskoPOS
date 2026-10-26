import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  config: { initialColorMode: 'light', useSystemColorMode: false },
  fonts: {
    heading: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`,
    body: `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif`,
  },
  colors: {
    brand: {
      50: '#eef4ff', 100: '#d9e6ff', 200: '#b3ccff', 300: '#80a8ff', 400: '#4d84f5',
      500: '#2563eb', 600: '#1d4fd1', 700: '#1a40a8', 800: '#183784', 900: '#162f6b',
    },
  },
  styles: {
    global: { body: { bg: 'gray.50', color: 'gray.800' } },
  },
  components: {
    Button: { defaultProps: { colorScheme: 'brand' } },
  },
});

export default theme;
