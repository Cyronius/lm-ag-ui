import React from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import ChatInterface from './components/ChatInterface';
import './App.css';
import theme from './theme';
import { Header } from './Header';

const App = () => {
    
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />            
            <Header/>
            <ChatInterface />            
        </ThemeProvider>
    );
};

export default App;


