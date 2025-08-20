import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext';

const integrations = [
    {
        name: "SCORM",
        logo: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/2981f8f7-fd50-cef8-1b9b-9ca4e7cf0076.png?timeStamp=638911233309839388",
        description: "SCORM.com integration"
    },
    {
        name: "Canva",
        logo: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/ba6283fe-4d45-dcc4-cd75-2aeb5a87ca4f.png?timeStamp=638911231386699400",
        description: "Design platform integration"
    },
    {
        name: "SSO",
        logo: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/22ca86d3-4f53-c4cf-355a-a81f5c91226c.png?timeStamp=638911232966860040",
        description: "Single Sign-On with Workday"
    }
];

const Integrations: React.FC = () => {
    const { mode } = useThemeMode();
    const isDark = mode === 'dark';

    return (
        <Box sx={{
            width: '100%',
            maxWidth: '1200px',
            mx: 'auto',
            px: { xs: 1, sm: 2, md: 3 }
        }}>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, 1fr)',
                        md: 'repeat(3, 1fr)'
                    },
                    gap: { xs: 2, sm: 2.5, md: 3 },
                    mb: { xs: 3, sm: 4 }
                }}
            >
                {integrations.map((integration, index) => (
                    <Card
                        key={index}
                        sx={{
                            border: 'none',
                            boxShadow: 'none',
                            background: 'none',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-start'
                        }}
                    >
                        <CardContent sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <Typography
                                sx={{
                                    position: 'absolute',
                                    fontSize: "1rem",
                                    color: isDark ? '#fff' : '#222',
                                    zIndex: 2,
                                }}
                            >
                                {integration.name}
                            </Typography>
                            <Box
                                component="img"
                                src={integration.logo}
                                alt={integration.name}
                                sx={{
                                    maxWidth: { xs: '180px', sm: '220px', md: '220px' },
                                    height: 'auto',
                                    objectFit: 'contain',
                                    borderRadius: '14px',
                                    mt: 3,
                                    display: 'block',
                                    border: '1px solid',
                                    borderColor: isDark ? '#444' : '#aeaeaeff',
                                    alignSelf: 'center'
                                }}
                            />
                        </CardContent>
                    </Card>
                ))}
            </Box>
        </Box>
    );
};

export default Integrations;