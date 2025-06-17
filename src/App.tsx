import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import ChatInterface from './components/ChatInterface';
import './App.css';
import theme from './theme';

const App = () => {
    console.log('App component rendered');
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <div>
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