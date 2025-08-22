import { CssBaseline } from '@mui/material';
import ChatInterface from './components/ChatInterface';
import './App.css';
import { Header } from './Header';
import { AgentClientProvider } from './contexts/AgentClientContext';
import { createSmarketingTools } from './tools/smartketingTools';
import { AppThemeProvider } from './contexts/ThemeContext';
import DynamicContent from './components/DynamicContent';
import React from 'react';

const App = () => {
    const tools = createSmarketingTools();

    // Track dynamic content meta from ChatInterface
    const [dynMeta, setDynMeta] = React.useState<{ showDynamicContent: boolean; lastQuestion?: string }>({
        showDynamicContent: false,
        lastQuestion: undefined
    });

    return (
        <AppThemeProvider>
            <AgentClientProvider tools={tools}>
                <CssBaseline />
                <div className="app-container">
                    <Header />
                    <div className="main-content">
                        <ChatInterface onDynamicMetaChange={setDynMeta} />
                        {dynMeta.showDynamicContent && (
                            <div className="dynamic-content-page-bottom">
                                <DynamicContent
                                    lastQuestion={dynMeta.lastQuestion}
                                    isVisible={true}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </AgentClientProvider>
        </AppThemeProvider>
    );
};

export default App;

