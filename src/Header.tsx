import { Box } from '@mui/material';
import { LightMode, DarkMode } from '@mui/icons-material';
import { useThemeMode } from './contexts/ThemeContext';

export function Header() {
    const { mode, toggleTheme } = useThemeMode();
    const isDark = mode === 'dark';

    return (
        <>
            <div className="top-right-toggle">
                <Box className="theme-toggle-switch">
                    <Box
                        className={`theme-toggle-switch__icon theme-toggle-switch__icon--left${!isDark ? ' selected' : ''}`}
                        onClick={() => { if (isDark) toggleTheme(); }}
                    >
                        <LightMode />
                    </Box>
                    <Box
                        className={`theme-toggle-switch__icon theme-toggle-switch__icon--right${isDark ? ' selected' : ''}`}
                        onClick={() => { if (!isDark) toggleTheme(); }}
                    >
                        <DarkMode />
                    </Box>
                </Box>
            </div>

            <header className="app-header">
                <h1 className="main-title">Hello, how can we help your training needs?</h1>
            </header>
        </>
    );
}