import { Box } from '@mui/material';
import React from 'react';

interface CalendlyArtifactProps {
    url: string;
    height?: number;
}

export const CalendlyArtifact: React.FC<CalendlyArtifactProps> = ({ url, height = 600 }) => {
    const [visible, setVisible] = React.useState(true);
    if (!visible) return null;
    return (
        <Box
            sx={{
                width: '100%',                
                minWidth: '1000px',
                maxWidth: '1000px',
                marginLeft: 'auto',
                marginRight: 'auto',                
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid #e0e0e0',
                position: 'relative'
            }}                        
        >            
            <iframe
                src={url}
                width="100%"
                height={height}
                frameBorder="0"
                title="Calendly Scheduling"
                style={{ display: 'block' }}
            />
        </Box>
    );
};