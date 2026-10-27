import { extendTheme } from '@chakra-ui/react';

// POS Theme Configuration
// Based on Room99 design system with POS-specific customizations

const theme = extendTheme({
  colors: {
    // Custom highlight orange color
    highlight: {
      50: '#fef5ed',
      100: '#fde6d3',
      200: '#facda6',
      300: '#f6ac6e',
      400: '#f08d42',
      500: '#E67E3C', // Main highlight color - vibrant orange
      600: '#d4632b',
      700: '#b14d23',
      800: '#8e3e20',
      900: '#72341d',
    },
    pos: {
      25: '#f8fafc',
      50: '#fef5ed', // Changed to orange tint
      100: '#fde6d3', // Changed to orange tint
      200: '#facda6',
      300: '#f6ac6e',
      400: '#f08d42',
      500: '#E67E3C', // Changed to vibrant orange
      600: '#d4632b',
      700: '#b14d23',
      800: '#8e3e20',
      900: '#72341d',
    },
    // Professional amber for reserved status
    amber: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
    },
    restaurant: {
      50: '#fef7f0',
      100: '#feeee0',
      200: '#fddcc0',
      300: '#fbc390',
      400: '#f8a060',
      500: '#f97316',
      600: '#ea580c',
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
    },
    kitchen: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
    },
    order: {
      pending: '#fbbf24',
      confirmed: '#3b82f6',
      preparing: '#f59e0b',
      ready: '#10b981',
      served: '#8b5cf6',
      completed: '#6b7280',
      cancelled: '#ef4444',
    },
    table: {
      available: '#22c55e',
      occupied: '#ef4444',
      reserved: '#fbbf24',
      cleaning: '#3b82f6',
      maintenance: '#f59e0b',
    },
    // POS-specific design tokens
    touch: {
      primary: '#0ea5e9',
      secondary: '#64748b',
      success: '#22c55e',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#3b82f6',
    },
    background: {
      primary: '#ffffff',
      secondary: '#f8fafc',
      tertiary: '#f1f5f9',
      dark: '#1e293b',
    }
  },
  fonts: {
    heading: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    body: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  },
  breakpoints: {
    // Custom breakpoints optimized for POS usage
    sm: '480px',    // Mobile phones (portrait)
    md: '768px',    // Tablets (portrait) 
    lg: '1024px',   // Tablets (landscape) / Small laptops
    xl: '1280px',   // Desktop / Large tablets
    '2xl': '1536px', // Large desktop
    // POS-specific breakpoints
    mobile: '480px',
    tablet: '768px',
    desktop: '1024px',
  },
  space: {
    // Enhanced spacing scale for touch interfaces
    px: '1px',
    0.5: '0.125rem',
    1: '0.25rem',
    1.5: '0.375rem',
    2: '0.5rem',
    2.5: '0.625rem',
    3: '0.75rem',
    3.5: '0.875rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    7: '1.75rem',
    8: '2rem',
    9: '2.25rem',
    10: '2.5rem',
    12: '3rem',
    14: '3.5rem',
    16: '4rem',
    20: '5rem',
    24: '6rem',
    28: '7rem',
    32: '8rem',
    36: '9rem',
    40: '10rem',
    44: '11rem',
    48: '12rem',
    52: '13rem',
    56: '14rem',
    60: '15rem',
    64: '16rem',
    72: '18rem',
    80: '20rem',
    96: '24rem',
    // POS-specific spacing for touch interfaces
    touch: {
      xs: '0.5rem',   // 8px
      sm: '0.75rem',  // 12px
      md: '1rem',     // 16px
      lg: '1.5rem',   // 24px
      xl: '2rem',     // 32px
      '2xl': '3rem',  // 48px
      '3xl': '4rem',  // 64px
    }
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: 'semibold',
        borderRadius: 'lg',
      },
      sizes: {
        // Touch-optimized sizes for POS interface
        sm: {
          h: '10',
          minW: '10',
          fontSize: 'sm',
          px: '4',
        },
        md: {
          h: '12',
          minW: '12',
          fontSize: 'md',
          px: '6',
        },
        lg: {
          h: '14',
          minW: '14',
          fontSize: 'lg',
          px: '8',
        },
        xl: {
          h: '16',
          minW: '16',
          fontSize: 'xl',
          px: '10',
        },
        // Special POS sizes
        touch: {
          h: '16',
          minW: '16',
          fontSize: 'lg',
          px: '8',
          fontWeight: 'bold',
        },
        touchLarge: {
          h: '20',
          minW: '20',
          fontSize: 'xl',
          px: '12',
          fontWeight: 'bold',
        },
      },
      variants: {
        pos: {
          bg: 'pos.500',
          color: 'white',
          _hover: {
            bg: 'pos.600',
            transform: 'translateY(-2px)',
            boxShadow: 'lg',
          },
          _active: {
            bg: 'pos.700',
            transform: 'translateY(0)',
          },
        },
        restaurant: {
          bg: 'restaurant.500',
          color: 'white',
          _hover: {
            bg: 'restaurant.600',
            transform: 'translateY(-2px)',
            boxShadow: 'lg',
          },
          _active: {
            bg: 'restaurant.700',
            transform: 'translateY(0)',
          },
        },
        kitchen: {
          bg: 'kitchen.500',
          color: 'white',
          _hover: {
            bg: 'kitchen.600',
            transform: 'translateY(-2px)',
            boxShadow: 'lg',
          },
          _active: {
            bg: 'kitchen.700',
            transform: 'translateY(0)',
          },
        },
        tableStatus: ({ colorScheme }) => ({
          bg: `table.${colorScheme}`,
          color: 'white',
          _hover: {
            opacity: 0.8,
            transform: 'scale(1.05)',
          },
          _active: {
            transform: 'scale(0.95)',
          },
        }),
        // Touch-optimized variants
        touchPrimary: {
          bg: 'touch.primary',
          color: 'white',
          borderRadius: 'xl',
          boxShadow: 'lg',
          _hover: {
            bg: 'pos.600',
            transform: 'translateY(-2px)',
            boxShadow: 'xl',
          },
          _active: {
            bg: 'pos.700',
            transform: 'scale(0.98)',
          },
          _disabled: {
            opacity: 0.6,
            cursor: 'not-allowed',
            _hover: {
              transform: 'none',
              bg: 'touch.primary',
            },
          },
        },
        touchSecondary: {
          bg: 'background.secondary',
          color: 'touch.secondary',
          border: '2px solid',
          borderColor: 'gray.300',
          borderRadius: 'xl',
          _hover: {
            bg: 'gray.100',
            borderColor: 'gray.400',
            transform: 'translateY(-1px)',
          },
          _active: {
            transform: 'scale(0.98)',
          },
        },
        touchSuccess: {
          bg: 'touch.success',
          color: 'white',
          borderRadius: 'xl',
          boxShadow: 'lg',
          _hover: {
            bg: 'green.600',
            transform: 'translateY(-2px)',
            boxShadow: 'xl',
          },
          _active: {
            bg: 'green.700',
            transform: 'scale(0.98)',
          },
        },
        touchDanger: {
          bg: 'touch.danger',
          color: 'white',
          borderRadius: 'xl',
          boxShadow: 'lg',
          _hover: {
            bg: 'red.600',
            transform: 'translateY(-2px)',
            boxShadow: 'xl',
          },
          _active: {
            bg: 'red.700',
            transform: 'scale(0.98)',
          },
        },
      },
    },
    Card: {
      baseStyle: {
        container: {
          borderRadius: 'xl',
          boxShadow: 'md',
          border: '1px solid',
          borderColor: 'gray.100',
          _hover: {
            boxShadow: 'lg',
            transform: 'translateY(-2px)',
          },
          transition: 'all 0.2s',
        },
      },
      variants: {
        pos: {
          container: {
            bg: 'white',
            borderColor: 'pos.200',
            _hover: {
              borderColor: 'pos.300',
              boxShadow: 'xl',
            },
          },
        },
        menuItem: {
          container: {
            bg: 'white',
            borderColor: 'gray.200',
            cursor: 'pointer',
            _hover: {
              borderColor: 'restaurant.300',
              boxShadow: 'lg',
              transform: 'scale(1.02)',
            },
            _active: {
              transform: 'scale(0.98)',
            },
          },
        },
        table: ({ colorScheme }) => ({
          container: {
            bg: 'white',
            borderColor: `table.${colorScheme}`,
            borderWidth: '2px',
            cursor: 'pointer',
            _hover: {
              bg: `table.${colorScheme}`,
              color: 'white',
              transform: 'scale(1.05)',
            },
            _active: {
              transform: 'scale(0.95)',
            },
          },
        }),
        order: ({ colorScheme }) => ({
          container: {
            bg: 'white',
            borderLeftWidth: '4px',
            borderLeftColor: `order.${colorScheme}`,
            _hover: {
              borderLeftColor: `order.${colorScheme}`,
              boxShadow: 'lg',
            },
          },
        }),
        // Touch-optimized card variants
        touchInteractive: {
          container: {
            bg: 'white',
            borderRadius: '2xl',
            borderWidth: '2px',
            borderColor: 'gray.200',
            boxShadow: 'md',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            minH: '20',
            p: '6',
            _hover: {
              borderColor: 'pos.300',
              boxShadow: 'xl',
              transform: 'translateY(-4px)',
            },
            _active: {
              transform: 'scale(0.98)',
            },
          },
        },
        touchSelected: {
          container: {
            bg: 'pos.50',
            borderRadius: '2xl',
            borderWidth: '3px',
            borderColor: 'pos.400',
            boxShadow: 'lg',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            minH: '20',
            p: '6',
            transform: 'translateY(-2px)',
            _hover: {
              borderColor: 'pos.500',
              boxShadow: 'xl',
              transform: 'translateY(-4px)',
            },
            _active: {
              transform: 'scale(0.98)',
            },
          },
        },
        touchTable: ({ colorScheme }) => ({
          container: {
            bg: 'white',
            borderRadius: '2xl',
            borderWidth: '3px',
            borderColor: `table.${colorScheme}`,
            boxShadow: 'lg',
            cursor: 'pointer',
            transition: 'all 0.3s ease-in-out',
            minH: '24',
            p: '6',
            _hover: {
              bg: `${colorScheme}.50`,
              borderColor: `table.${colorScheme}`,
              boxShadow: '2xl',
              transform: 'scale(1.05)',
            },
            _active: {
              transform: 'scale(0.95)',
            },
          },
        }),
        touchMenuItem: {
          container: {
            bg: 'white',
            borderRadius: '2xl',
            borderWidth: '2px',
            borderColor: 'gray.200',
            boxShadow: 'lg',
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out',
            overflow: 'hidden',
            _hover: {
              borderColor: 'restaurant.300',
              boxShadow: '2xl',
              transform: 'translateY(-6px)',
            },
            _active: {
              transform: 'scale(0.98)',
            },
          },
        },
        // Professional table card variants
        professionalTableAvailable: {
          container: {
            bg: 'white',
            borderRadius: 'xl',
            borderWidth: '1px',
            borderColor: 'gray.200',
            borderLeftWidth: '4px',
            borderLeftColor: 'green.500',
            boxShadow: 'sm',
            cursor: 'pointer',
            transition: 'all 0.2s ease-out',
            minH: '24',
            position: 'relative',
            _hover: {
              transform: 'translateY(-2px)',
              boxShadow: 'md',
              borderColor: 'gray.300',
              borderLeftColor: 'green.600',
            },
            _active: {
              transform: 'scale(0.99)',
            },
          },
        },
        professionalTableOccupied: {
          container: {
            bg: 'white',
            borderRadius: 'xl',
            borderWidth: '1px',
            borderColor: 'gray.200',
            borderLeftWidth: '4px',
            borderLeftColor: 'red.500',
            boxShadow: 'sm',
            cursor: 'not-allowed',
            transition: 'all 0.2s ease-out',
            minH: '24',
            position: 'relative',
            opacity: 0.95,
            _hover: {
              borderColor: 'gray.300',
            },
          },
        },
        professionalTableReserved: {
          container: {
            bg: 'white',
            borderRadius: 'xl',
            borderWidth: '1px',
            borderColor: 'gray.200',
            borderLeftWidth: '4px',
            borderLeftColor: 'amber.500',
            boxShadow: 'sm',
            cursor: 'pointer',
            transition: 'all 0.2s ease-out',
            minH: '24',
            position: 'relative',
            _hover: {
              transform: 'translateY(-2px)',
              boxShadow: 'md',
              borderColor: 'gray.300',
              borderLeftColor: 'amber.600',
            },
            _active: {
              transform: 'scale(0.99)',
            },
          },
        },
        professionalTableCleaning: {
          container: {
            bg: 'white',
            borderRadius: 'xl',
            borderWidth: '1px',
            borderColor: 'gray.200',
            borderLeftWidth: '4px',
            borderLeftColor: 'blue.500',
            boxShadow: 'sm',
            cursor: 'not-allowed',
            transition: 'all 0.2s ease-out',
            minH: '24',
            position: 'relative',
            opacity: 0.95,
            _hover: {
              borderColor: 'gray.300',
            },
          },
        },
        professionalTableMaintenance: {
          container: {
            bg: 'white',
            borderRadius: 'xl',
            borderWidth: '1px',
            borderColor: 'gray.200',
            borderLeftWidth: '4px',
            borderLeftColor: 'orange.500',
            boxShadow: 'sm',
            cursor: 'not-allowed',
            transition: 'all 0.2s ease-out',
            minH: '24',
            position: 'relative',
            opacity: 0.95,
            _hover: {
              borderColor: 'gray.300',
            },
          },
        },
        professionalTableSelected: {
          container: {
            bg: 'pos.25',
            borderRadius: 'xl',
            borderWidth: '2px',
            borderColor: 'pos.400',
            borderLeftWidth: '4px',
            borderLeftColor: 'pos.600',
            boxShadow: 'md',
            cursor: 'pointer',
            transition: 'all 0.2s ease-out',
            minH: '24',
            transform: 'translateY(-1px)',
            position: 'relative',
            _hover: {
              transform: 'translateY(-3px)',
              boxShadow: 'lg',
              borderColor: 'pos.500',
              borderLeftColor: 'pos.700',
            },
            _active: {
              transform: 'scale(0.99) translateY(-1px)',
            },
          },
        },
      },
    },
    Badge: {
      variants: {
        orderStatus: ({ colorScheme }) => ({
          bg: `order.${colorScheme}`,
          color: 'white',
          fontWeight: 'bold',
          px: 3,
          py: 1,
          borderRadius: 'full',
          textTransform: 'uppercase',
          fontSize: 'xs',
        }),
        dietary: {
          bg: 'green.100',
          color: 'green.800',
          fontWeight: 'semibold',
          px: 2,
          py: 1,
          borderRadius: 'md',
          fontSize: 'xs',
        },
        // Enhanced modern pill badges
        modernPill: ({ colorScheme = 'gray' }) => ({
          bg: `${colorScheme}.100`,
          color: `${colorScheme}.800`,
          fontWeight: 'bold',
          px: 4,
          py: 2,
          borderRadius: 'full',
          fontSize: 'sm',
          border: '1px solid',
          borderColor: `${colorScheme}.200`,
          boxShadow: 'sm',
          _hover: {
            bg: `${colorScheme}.200`,
            borderColor: `${colorScheme}.300`,
          },
        }),
        statusPill: ({ colorScheme = 'gray' }) => ({
          bg: `${colorScheme}.500`,
          color: 'white',
          fontWeight: 'bold',
          px: 3,
          py: 1,
          borderRadius: 'full',
          fontSize: 'xs',
          textTransform: 'uppercase',
          letterSpacing: 'wider',
          boxShadow: 'md',
          position: 'relative',
          _before: {
            content: '""',
            position: 'absolute',
            left: 2,
            top: '50%',
            transform: 'translateY(-50%)',
            w: 2,
            h: 2,
            bg: 'white',
            borderRadius: 'full',
          },
        }),
        // Professional status dot variant
        statusDot: ({ colorScheme = 'gray' }) => ({
          display: 'inline-flex',
          alignItems: 'center',
          bg: 'transparent',
          color: `${colorScheme}.700`,
          fontWeight: '600',
          fontSize: 'xs',
          textTransform: 'capitalize',
          _before: {
            content: '""',
            display: 'inline-block',
            w: '8px',
            h: '8px',
            bg: `${colorScheme}.500`,
            borderRadius: 'full',
            mr: 2,
            flexShrink: 0,
          },
        }),
        contextBadge: {
          bg: 'pos.50',
          color: 'pos.700',
          fontWeight: 'semibold',
          px: 3,
          py: 1,
          borderRadius: 'full',
          fontSize: 'xs',
          border: '1px solid',
          borderColor: 'pos.200',
          boxShadow: 'sm',
        },
        // Professional feature tag variant
        featureTag: {
          bg: 'gray.100',
          color: 'gray.600',
          fontWeight: '500',
          px: 2,
          py: 1,
          borderRadius: 'md',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        },
      },
    },
    Stat: {
      baseStyle: {
        container: {
          bg: 'white',
          p: 6,
          borderRadius: 'xl',
          boxShadow: 'md',
          border: '1px solid',
          borderColor: 'gray.100',
        },
        label: {
          fontSize: 'sm',
          fontWeight: 'medium',
          color: 'gray.600',
        },
        number: {
          fontSize: '2xl',
          fontWeight: 'bold',
          color: 'gray.900',
        },
      },
    },
    Modal: {
      baseStyle: {
        dialog: {
          borderRadius: 'xl',
          boxShadow: '2xl',
        },
        header: {
          fontWeight: 'bold',
          fontSize: 'xl',
        },
      },
    },
    Drawer: {
      baseStyle: {
        dialog: {
          bg: 'gray.50',
        },
        header: {
          fontWeight: 'bold',
          fontSize: 'xl',
        },
      },
    },
  },
  styles: {
    global: {
      body: {
        bg: 'gray.50',
        color: 'gray.800',
      },
      '*::placeholder': {
        color: 'gray.400',
      },
      '*, *::before, &::after': {
        borderColor: 'gray.200',
      },
    },
  },
  config: {
    initialColorMode: 'light',
    useSystemColorMode: false,
  },
  shadows: {
    pos: '0 10px 15px -3px rgba(14, 165, 233, 0.1), 0 4px 6px -2px rgba(14, 165, 233, 0.05)',
    restaurant: '0 10px 15px -3px rgba(249, 115, 22, 0.1), 0 4px 6px -2px rgba(249, 115, 22, 0.05)',
    kitchen: '0 10px 15px -3px rgba(34, 197, 94, 0.1), 0 4px 6px -2px rgba(34, 197, 94, 0.05)',
  },
});

export default theme;