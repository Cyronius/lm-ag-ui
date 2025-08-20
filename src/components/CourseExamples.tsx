import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext';

const courseExamples = [
    {
        title: "What's for department store",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/dc52123f-4f13-03d8-27f6-e09e05681f41.png?timeStamp=638911437984343418",
    },
    {
        title: "University Ethics",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/feca354a-a434-f145-84ed-4b6a7b82fc73.png?timeStamp=638911433824208563",
    },
    {
        title: "HIPAA Best Practices",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/9f956af8-38fe-1637-3624-27369fd19818.png?timeStamp=638911433824208410",
    },
    {
        title: "Safety",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/2a0bbbb6-9e77-246c-abd0-d93f5d4602ff.png?timeStamp=638911433824208236",
    },
    {
        title: "Car Wash",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/a425b4de-1b26-69e6-c431-a6b6777429cd.png?timeStamp=638911433491957608",
    },
    {
        title: "Leave from a Company",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/a615cbf7-9712-c40a-fe49-0e3ec2ec563b.png?timeStamp=638911433824207867"
    }
];

const CourseExamples: React.FC = () => {
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
                {courseExamples.map((course, index) => (
                    <Card
                        key={index}
                        sx={{ border: 'none', boxShadow: 'none', background: 'none' }}
                    >
                        <CardContent sx={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <Typography>
                                {course.title}
                            </Typography>
                            <Box
                                component="img"
                                src={course.image}
                                alt={course.title}
                                sx={{
                                    maxWidth: { xs: '180px', sm: '220px', md: '220px' },
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

export default CourseExamples;