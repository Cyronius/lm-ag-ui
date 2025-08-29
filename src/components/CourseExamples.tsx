import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext';
import UseCases, { UseCase } from './UseCases';

const courseExamples: UseCase[] = [
    {
        title: "What's for department store",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/dc52123f-4f13-03d8-27f6-e09e05681f41.png?timeStamp=638911437984343418",
        description: ""
    },
    {
        title: "University Ethics",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/feca354a-a434-f145-84ed-4b6a7b82fc73.png?timeStamp=638911433824208563",
        description: ""
    },
    {
        title: "HIPAA Best Practices",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/9f956af8-38fe-1637-3624-27369fd19818.png?timeStamp=638911433824208410",
        description: ""
    },
    {
        title: "Safety",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/2a0bbbb6-9e77-246c-abd0-d93f5d4602ff.png?timeStamp=638911433824208236",
        description: ""
    },
    {
        title: "Car Wash",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/a425b4de-1b26-69e6-c431-a6b6777429cd.png?timeStamp=638911433491957608",
        description: ""
    },
    {
        title: "Leave from a Company",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/a615cbf7-9712-c40a-fe49-0e3ec2ec563b.png?timeStamp=638911433824207867",
        description: ""
    }
];

const CourseExamples: React.FC = () => {
    return (
        <UseCases useCases={courseExamples} />
    )
};

export default CourseExamples;