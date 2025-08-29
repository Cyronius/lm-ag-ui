import React, { useState, useRef } from 'react';
import { Box, Collapse, Button } from '@mui/material';
import { KeyboardArrowUp } from '@mui/icons-material';
import UseCases from './UseCases';
import Integrations from './Integrations';
import CourseExamples from './CourseExamples';
import { useThemeMode } from '../contexts/ThemeContext';

interface DynamicContentProps {
    lastQuestion?: string;
    isVisible: boolean;
    onOpenChange?: (open: boolean) => void;
}

const DynamicContent: React.FC<DynamicContentProps> = ({ lastQuestion, isVisible, onOpenChange }) => {
    const { mode } = useThemeMode();
    const isDark = mode === 'dark';
    const [showContent, setShowContent] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    if (!isVisible) return null;

    // Determine content type based on last question or active input
    const getContentType = () => {
        if (!lastQuestion) return 'usecases';
        const q = lastQuestion.toLowerCase();

        if (q.includes('integration') || q.includes('system') || q.includes('connect')) {
            return 'integrations';
        }
        if (
            q.includes('create training account') ||
            q.includes('course') ||
            q.includes('training content') ||
            q.includes('curriculum') ||
            q.includes('lesson')
        ) {
            return 'courses';
        }
        return 'usecases';
    };

    const contentType = getContentType();
    const buttonLabel =
        contentType === 'integrations' ? 'Integrations' :
            contentType === 'courses' ? 'Course examples' :
                'Use Cases';

    const renderContent = () => {
        switch (contentType) {
            case 'integrations':
                return <Integrations />;
            case 'courses':
                return <CourseExamples />;
            default:
                return <UseCases />;
        }
    };

    const handleToggleContent = () => {
        setShowContent((s) => {
            const next = !s;
            onOpenChange?.(next);
            return next;
        });
    };

    return (
        <Box
            sx={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative'
            }}
        >
            {/* Toggle button always above the content */}
            <Button
                onClick={handleToggleContent}
                aria-expanded={showContent}
                aria-controls="dynamic-content-panel"
                className="use-cases-toggle"
                disableRipple
                disableElevation
                sx={{
                    boxShadow: 'none',
                    backgroundColor: 'transparent',
                    '&:hover': {
                        backgroundColor: 'transparent',
                        boxShadow: 'none'
                    },
                    color: isDark ? '#fff' : '#333',
                }}
            >
                {buttonLabel}
                <KeyboardArrowUp
                    sx={{
                        transform: showContent ? 'rotate(0deg)' : 'rotate(180deg)',
                        transition: 'transform 0.3s ease'
                    }}
                />
            </Button>

            {/* Collapsible content below the button to push page down/up */}
            <Collapse
                in={showContent}
                timeout={500}
                sx={{
                    width: '100%',
                    mb: 2,
                    '& .MuiCollapse-wrapper': { width: '100%' }
                }}
            >
                <Box
                    id="dynamic-content-panel"
                    ref={contentRef}
                    sx={{
                        width: '100%',
                        px: { xs: 0, sm: 1, md: 2 },
                        py: 2,
                    }}
                >
                    {renderContent()}
                </Box>
            </Collapse>
        </Box>
    );
};

export default DynamicContent;