import { createTheme, ThemeOptions } from '@mui/material/styles';

export const createAppTheme = (mode: 'light' | 'dark') => {
    const isDark = mode === 'dark';

    return createTheme({
        palette: {
            mode,
            primary: {
                main: '#2462ad',
                light: '#5a8fd4',
                dark: '#1a4582'
            },
            secondary: {
                main: '#2462ad'
            },
            background: {
                default: isDark ? '#1a1a1a' : '#ffffff',
                paper: isDark ? '#1a1a1a' : '#ffffff'
            },
            text: {
                primary: isDark ? '#ffffff' : '#222222',
                secondary: isDark ? '#b0b0b0' : '#4a5568'
            },
            divider: isDark ? '#333333' : '#e0e0e0'
        },
        typography: {
            fontFamily: '"Rubik", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            allVariants: {
                color: isDark ? '#ffffff' : '#222222'
            },
            h1: {
                fontWeight: 700,
                color: isDark ? '#ffffff' : '#222222'
            },
            h2: {
                fontWeight: 600,
                color: isDark ? '#ffffff' : '#222222'
            },
            h3: {
                fontWeight: 600,
                color: isDark ? '#ffffff' : '#222222'
            },
            body1: {
                color: isDark ? '#b0b0b0' : '#4a5568'
            }
        },
        components: {
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: 20,
                        boxShadow: 'none',
                        fontWeight: 500,
                        fontSize: '1rem',
                        textTransform: 'none',
                        '&:hover': {
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }
                    },
                    contained: {
                        backgroundColor: isDark ? '#2462ad' : '#2462ad',
                        color: '#ffffff',
                        '&:hover': {
                            backgroundColor: isDark ? '#1a4582' : '#1a4582'
                        }
                    },
                    outlined: {
                        borderColor: isDark ? '#555' : '#bbb',
                        color: isDark ? '#ffffff' : '#2462ad',
                        '&:hover': {
                            borderColor: isDark ? '#666' : '#999',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(36,98,173,0.05)'
                        }
                    }
                },
            },
            MuiTextField: {
                styleOverrides: {
                    root: {
                        '& .MuiOutlinedInput-root': {
                            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
                            '& fieldset': {
                                borderColor: isDark ? '#555' : '#e0e0e0'
                            },
                            '&:hover fieldset': {
                                borderColor: isDark ? '#666' : '#bbb'
                            },
                            '&.Mui-focused fieldset': {
                                borderColor: '#2462ad'
                            }
                        }
                    }
                }
            }
        }
    });
};

// Default light theme
const theme = createAppTheme('light');
export default theme;