import Button from '@mui/material/Button';
import { useAgentContext } from '../contexts/AgentClientContext';
import { Message } from '@ag-ui/client';
import { getAllToolDefinitions } from '../tools/toolUtils'
import Stack from '@mui/system/Stack'
import { Box } from '@mui/system';
import Typography from '@mui/material/Typography'

// TypeScript type for the outline parameter based on the provided JSON
export type OutlineModule = {
    type: 'lesson';
    header: string;
    prompt: string;
    description: string;
};

export type Outline = {
    modules: OutlineModule[];
    header: string;
    headerImagePath: string;
    imagePrompt: string;
    description: string;
};

export default function SocoOutlineSignupFlow({ outline }: { outline: Outline }) {

    const { 
        agentClient, 
        session, 
        tools, 
        messages, 
        addMessage,
        agentSubscriber,
        currentMessage: agentCurrentMessage,
        getToolNameFromCallId,
        globalState
    } = useAgentContext();

    async function doSignup() {
                
        // Add user message
        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: 'invoke the approve_outline_tool'
        };
        
        agentClient.startNewRun();
        try {

            // stick soco outline into state and send state snapshot prior to run
            agentClient.setState({ ...globalState, soco_outline: outline })

            await agentClient.runAgent(
                [...messages, userMessage],
                getAllToolDefinitions(tools),
                agentSubscriber
            );
        } catch (error) {
            console.error('Agent execution failed:', error);
            // Error handling is now managed by the hook
            throw error;
        }

    }

    return (
        <div>
            <SoCoOutlineView outline={outline} />            
            <Button variant="contained" sx={{ maxWidth: '20em', mt: '1em' }} onClick={doSignup}>Create this Course Now</Button>
        </div>
    )
}

export function SoCoOutlineView({ outline }: { outline: Outline }) {
    

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', lineHeight: 1.3 }}>
        
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} >
                <div style={{ display: 'flex', flexDirection: 'column' }} >                    
                    <Typography variant="h6">{outline.header}</Typography>
                    <Typography variant="body2" sx={{ flexGrow: 1, alignContent: 'center' }}>{outline.description}</Typography>                    
                </div>
                <div>                    
                    {outline.headerImagePath && <Box component="img" sx={{ maxWidth: { xs: '50%', sm: '300px' } }}  src={outline.headerImagePath} />}
                </div>
                
            </Stack>
            
            <div>                
                <div>                
                    <ul style={{ listStyle: 'none' }}>
                        {outline.modules.map((module, idx) => (
                            <li key={idx}>                                
                                <p style={{ paddingTop: '0.5em' }}><Typography variant="subtitle2">{module.header}</Typography>
                                   <Typography variant="body2">{module.description}</Typography>
                                </p>                                
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
                
        </div>
    )
}