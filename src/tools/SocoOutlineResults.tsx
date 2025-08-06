import Button from '@mui/material/Button';
import { useAgentContext } from '../contexts/AgentClientContext';
import { Message } from '@ag-ui/client';

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
    imagePrompt: string;
    description: string;
};

export default function SocoOutlineSignupFlow({ outline }: { outline: Outline }) {

    const { agentClient, session, tools } = useAgentContext();

    async function doSignup() {
        
        // // TODO: invoke backend tool cool for signup
        // // Add user message
        // const userMessage: Message = {
        //     id: `user_${Date.now()}`,
        //     role: 'user',
        //     content: 'sign me up for learner mobile'
        // };
        
        
        // // Start new run
        // const runState = agentClient.startNewRun();

        

        // try {
        //     // await agentClient.runAgent(
        //     //     conversationMessages,
        //     //     allTools,
        //     //     agentSubscriber
        //     // );
        // } catch (error) {
        //     console.error('Agent execution failed:', error);
        //     // Error handling is now managed by the hook
        //     throw error;
        // }
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
        
        <i>add some short verbiage about the course</i>

        <h5>Course Title: {outline.header}</h5>
        
        <div>
            <h5>Course Overview:</h5>
            {outline.description}
        </div>

        <div>
            <h5>Learning Objectives:</h5>
            <span>By the end of this course, learners will yada yada yada</span>
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
        
        <span>Would you like for Learner Mobile to create this course for you? It's going to look like this!</span>
        <p>[This is where we would put some preview images]</p>
        
    </div>
}