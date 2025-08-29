import { Box } from '@mui/material';
import { LightMode, DarkMode } from '@mui/icons-material';
import { useThemeMode } from './contexts/ThemeContext';

export function Header() {
    const { mode, toggleTheme } = useThemeMode();
    const isDark = mode === 'dark';

    return (
        <>
            <header className="app-header">
                <nav
                    className="nav"
                >
                    <img className="logo" src="lm-logo-red.png" alt="Learner Mobile logo" />
                    <ul className="nav-links">
                        <li>
                            <a href="https://learnermobile.com/product/" style={{ textDecoration: "none", color: "unset" }}>Platform</a>
                        </li>
                        <li>
                            <a href="https://learnermobile.com/solutions/" style={{ textDecoration: "none", color: "unset" }}>Solutions</a>
                        </li>
                        <li>
                            <a href="https://app.learnermobile.com/" style={{ textDecoration: "none", color: "unset" }}>Login</a>
                        </li>
                        <li>
                            <a href="https://admin.learnermobile.com/Account/SignUp/" style={{ textDecoration: "none", color: "unset" }}>Get started</a>
                        </li>
                        <li>
                            <div className="top-right-toggle">
                                <Box className="theme-toggle-switch">
                                    <Box
                                        className={`theme-toggle-switch__icon theme-toggle-switch__icon--left${
                                            !isDark ? " selected" : ""
                                        }`}
                                        onClick={() => {
                                            if (isDark) toggleTheme();
                                        }}
                                    >
                                        <LightMode />
                                    </Box>
                                    <Box
                                        className={`theme-toggle-switch__icon theme-toggle-switch__icon--right${
                                            isDark ? " selected" : ""
                                        }`}
                                        onClick={() => {
                                            if (!isDark) toggleTheme();
                                        }}
                                    >
                                        <DarkMode />
                                    </Box>
                                </Box>
                            </div>
                        </li>
                    </ul>
                </nav>
                <h1 className="main-title">
                    Hello, how can we help your training needs?
                </h1>
            </header>
        </>
    );
}