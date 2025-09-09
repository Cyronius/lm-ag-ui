import { useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import IconButton from "@mui/material/IconButton";
import { useThemeMode } from "./contexts/ThemeContext";

export function Header() {
    const { mode, toggleTheme } = useThemeMode();

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isDark = mode === "dark";
    const lmLogoPath = `lm-logo-${isDark ? "dark" : "light"}.png`;

    function renderNavLinks(isMobile: boolean) {
        return (
            <ul className={`nav-links ${isMobile ? "mobile" : "default"}`}>
                <li>
                    <a href="https://training.learnermobile.com/">
                        Training Platform
                    </a>
                </li>
                <li>
                    <a href="https://training.learnermobile.com/pricing/">Pricing</a>
                </li>
                <li>
                    <a href="https://training.learnermobile.com/contact-us/">
                        Contact Us
                    </a>
                </li>
                <li>
                    <a href="https://app.learnermobile.com/">Login</a>
                </li>
                <li>
                    <a href="https://admin.learnermobile.com/Account/SignUp/">
                        Get started
                    </a>
                </li>
            </ul>
        );
    }

    return (
        <>
            <nav className="nav">
                <a href="https://learnermobile.com">
                    <img
                        className="logo"
                        src={lmLogoPath}
                        alt="Learner Mobile logo"
                    />
                </a>
                {renderNavLinks(false)}
                <div className="mobile-menu-container">
                    <IconButton
                        aria-label="Mobile Menu"
                        sx={{ color: "black" }}
                        onClick={() => setMobileMenuOpen((prev) => !prev)}
                    >
                        {!mobileMenuOpen ? <MenuIcon /> : <CloseIcon />}
                    </IconButton>
                    {mobileMenuOpen && (
                        <div className="mobile-menu">
                            {renderNavLinks(true)}
                        </div>
                    )}
                </div>
            </nav>
            <header className="app-header">
                <h1 className="main-title">
                    Hi there! What training challenges can we help you with today?
                </h1>
            </header>
        </>
    );
}
