import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext';

const useCases = [
    {
        title: "I need to create an entire curriculum with courses that consists of 5 or more courses for a specific topic in a few days",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/4492284f-8b0b-4aa8-ee56-10ce9a95bad4.png?timeStamp=638911458275554634",
        description: "Complete curriculum development"
    },
    {
        title: "I need to prepare in-person employee training sessions in various locations in the U.S. in a few weeks from now",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/1da35b33-2d84-dd43-8433-2144a2abf754.png?timeStamp=638911459217995671",
        description: "Multi-location training setup"
    },
    {
        title: "I need to do a major overhaul on new employee onboarding training sessions, and get everything ready in 2 weeks",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/fa51795d-eae8-f44b-ea1e-4b1c2751f724.png?timeStamp=638911460010385232",
        description: "Onboarding transformation"
    }
];

const UseCases: React.FC = () => {
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
                }}
            >
                {useCases.map((useCase, index) => (
                    <Card
                        key={index}
                        sx={{ border: 'none', boxShadow: 'none', background: 'none' }}
                    >
                        <CardContent sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: isDark ? '#e0e0e0' : '#666',
                                    lineHeight: 1.4,
                                    fontSize: '0.8rem',
                                    paddingBottom: 1,
                                }}
                            >
                                {useCase.title}
                            </Typography>
                            <Box
                                component="img"
                                src={useCase.image}
                                alt={useCase.description}
                                sx={{
                                    maxWidth: { xs: '180px', sm: '220px', md: '250px' },
                                    height: 'auto',
                                    objectFit: 'cover',
                                    backgroundColor: isDark ? '#444' : '#f5f5f5',
                                    borderRadius: '14px',
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

export default UseCases;