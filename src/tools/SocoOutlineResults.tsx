import Button from '@mui/material/Button';

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

export default function SocoOutlineResults({ outline }: { outline: Outline }) {

    console.log('outline', outline)

    return <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', lineHeight: 1.3}}>
        
        <i>add some short verbiage about the course</i>

        <h5>Course Title: {outline.header}</h5>
        
        <p>
            <h5>Course Overview:</h5>
            {outline.description}
        </p>

        <p>
            <h5>Learning Objectives:</h5>
            <span>By the end of this course, learners will yada yada yada</span>
        </p>
        
        <p>
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
        </p>
        
        <span>Would you like for Learner Mobile to create this course for you? It's going to look like this!</span>
        <p>[This is where we would put some preview images]</p>
        <Button variant="contained" style={{ maxWidth: '10em' }}>Yes</Button>
    </div>
}