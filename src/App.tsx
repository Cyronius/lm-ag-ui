import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import ChatInterface from './components/ChatInterface';
import './App.css';
import theme from './theme';
import { Header } from './Header';
import { AgentClientProvider } from './contexts/AgentClientContext';
import { createSmarketingTools } from './tools/smartketingTools';

const App = () => {
    // Create tools without state management - provider will inject it at execution time
    const tools = createSmarketingTools();
    
    return (
        <AgentClientProvider tools={tools}>
            <ThemeProvider theme={theme}>
                <CssBaseline />            
                <Header/>
                <ChatInterface />            
            </ThemeProvider>
        </AgentClientProvider>
    );
};

export default App;


