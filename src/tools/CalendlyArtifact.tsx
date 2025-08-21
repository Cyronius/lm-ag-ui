import { Box } from '@mui/material';
import React from 'react';

interface CalendlyArtifactProps {
    url: string;
    height?: number;
}

export const CalendlyArtifact: React.FC<CalendlyArtifactProps> = ({ url, height = 1000 }) => {
    const [visible, setVisible] = React.useState(true);
    if (!visible) return null;
    return (
        <Box
            sx={{
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #e0e0e0',
            }}                        
        >     
            <iframe
                src={url}
                width="100%"
                height={height}
                frameBorder="0"
                title="Schedule a Demo"
                style={{ display: 'block' }}
            />
        </Box>
    );
};