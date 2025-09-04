import { CssBaseline } from '@mui/material';
import ChatInterface from './components/ChatInterface';
import './App.css';
import { Header } from './Header';
import { AgentClientProvider } from './contexts/AgentClientContext';
import { createSmarketingTools } from './tools/smartketingTools';
import { AppThemeProvider } from './contexts/ThemeContext';

const App = () => {
    const tools = createSmarketingTools();

    return (
        <AppThemeProvider>
            <AgentClientProvider tools={tools}>
                <CssBaseline />
                <div className="app-container">
                    <Header />
                    <div className="main-content">
                        <ChatInterface />
                    </div>
                </div>
            </AgentClientProvider>
        </AppThemeProvider>
    );
};

export default App;

