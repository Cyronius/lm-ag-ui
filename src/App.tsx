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
                <ChatInterface />
            </div>
        </ThemeProvider>
    );
};

export default App;