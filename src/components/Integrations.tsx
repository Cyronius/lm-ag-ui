import React from 'react';
import UseCases, { UseCase } from './UseCases';

const integrations: UseCase[] = [
    {
        title: "SCORM",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/2981f8f7-fd50-cef8-1b9b-9ca4e7cf0076.png?timeStamp=638911233309839388",
        description: "SCORM.com integration"
    },
    {
        title: "Canva",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/ba6283fe-4d45-dcc4-cd75-2aeb5a87ca4f.png?timeStamp=638911231386699400",
        description: "Design platform integration"
    },
    {
        title: "SSO",
        image: "https://premiumlearnermobileblob.blob.core.windows.net/e840bd34-5281-40dc-afce-d4c43d9c4fa2/22ca86d3-4f53-c4cf-355a-a81f5c91226c.png?timeStamp=638911232966860040",
        description: "Single Sign-On with Workday"
    }
];

const Integrations: React.FC = () => {
    return (
        <UseCases useCases={integrations} />
    );
};

export default Integrations;