import React from 'react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import ChatInterface from './components/ChatInterface';

const theme = createTheme({
    palette: {
        primary: {
            main: '#1976d2',
        },
        secondary: {
            main: '#dc004e',
        },
    },
});

const App = () => {
    console.log('App component rendered');
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <div className="app-container">
                <header className="app-header">
                    <span className="badge">✨ AI-Powered Training Assistant</span>
                    <h1 className="main-title">Your AI Training Assistant</h1>
                    <p className="subtitle">
                        Ask questions, create content, schedule demos, or get account help - all through natural conversation.
                    </p>
                </header>
                <ChatInterface />
            </div>
        </ThemeProvider>
    );
};

export default App;