import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import ChatInterface from './components/ChatInterface';
import './App.css';
import theme from './theme';
import { Header } from './Header';
import { AgentClientProvider } from './contexts/AgentClientContext';

const App = () => {
    
    return (
        <AgentClientProvider>
            <ThemeProvider theme={theme}>
                <CssBaseline />            
                <Header/>
                <ChatInterface />            
            </ThemeProvider>
        </AgentClientProvider>
    );
};

export default App;


