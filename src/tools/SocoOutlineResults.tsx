import Button from '@mui/material/Button';
import { useAgentContext } from '../contexts/AgentClientContext';
import { Message } from '@ag-ui/client';
import { getAllToolDefinitions } from '../tools/toolUtils'

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
            <Button variant="contained" style={{ maxWidth: '10em' }} onClick={doSignup}>Yes</Button>
        </div>
    )
}

export function SoCoOutlineView({ outline }: { outline: Outline }) {
    

    return <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', lineHeight: 1.3}}>

        <h5>Course Title: {outline.header}</h5>
        {outline.headerImagePath && <img src={outline.headerImagePath} />}
        
        <div>
            <h5>Course Overview:</h5>
            {outline.description}
        </div>

        <div>
            <h5>Course Modules:</h5>
            <div>
            
                <ul>
                    {outline.modules.map((module, idx) => (
                        <li key={idx}>
                            <p><i>Module {idx + 1}:</i> {module.header}</p>
                            <p>{module.description}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
        
        <span>Would you like for Learner Mobile to create this course for you?</span>
                
    </div>
}