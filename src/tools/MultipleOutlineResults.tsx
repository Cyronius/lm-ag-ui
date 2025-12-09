import { useState, useEffect } from 'react';
import { Accordion, AccordionItem } from '@szhsin/react-accordion';
import { Outline, SoCoOutlineView } from './SocoOutlineResults';
import { Alert, Box, Typography, Button, IconButton } from '@mui/material';
import { KeyboardArrowDown, Undo, Delete } from '@mui/icons-material';
import { useAgentContext } from '../contexts/AgentClientContext';
import { Message } from '@ag-ui/client';
import { getAllToolDefinitions } from '../tools/toolUtils';
import './MultipleOutlineResults.css';

export interface MultipleOutlinesMetadata {
    totalRequested: number;
    totalGenerated: number;
    failedTopics: string[];
}

export interface MultipleOutlinesProps {
    outlines: Outline[];
    metadata: MultipleOutlinesMetadata;
}

interface OutlineStatus {
    id: number;
    outline: Outline;
    status: 'pending' | 'accepted' | 'discarded';
}

export default function MultipleOutlineResults({ outlines, metadata }: MultipleOutlinesProps) {
    const [outlineStatuses, setOutlineStatuses] = useState<OutlineStatus[]>([]);

    // Get agent context for signup/course creation
    const {
        agentClient,
        tools,
        messages,
        agentSubscriber,
        globalState
    } = useAgentContext();

    // Check if this is a single outline (backward compatibility mode)
    const isSingleOutline = outlines && outlines.length === 1;

    // Initialize outline statuses, preserving existing discard states
    useEffect(() => {
        if (outlines && outlines.length > 0) {
            setOutlineStatuses(prev => {
                // Create map of existing statuses by outline header (unique identifier)
                const existingStatusMap = new Map(
                    prev.map(item => [item.outline.header, item.status])
                );

                // Map new outlines, preserving status if it exists
                return outlines.map((outline, idx) => ({
                    id: idx,
                    outline,
                    status: existingStatusMap.get(outline.header) || 'pending'
                }));
            });
        }
    }, [outlines]);


    // Show error if no outlines generated
    if (!outlines || outlines.length === 0) {
        return (
            <Alert severity="error" sx={{ mt: 2 }}>
                No course outlines were generated. Please try again with different topics.
            </Alert>
        );
    }

    // Show warning if some topics failed
    const hasPartialFailure = metadata.failedTopics && metadata.failedTopics.length > 0;

    const handleDiscard = (id: number) => {
        setOutlineStatuses(prev =>
            prev.map(item =>
                item.id === id ? { ...item, status: 'discarded' as const } : item
            )
        );
    };

    const handleUndo = (id: number) => {
        setOutlineStatuses(prev =>
            prev.map(item =>
                item.id === id ? { ...item, status: 'pending' as const } : item
            )
        );
    };

    // Handle single course signup (same as SocoOutlineSignupFlow)
    async function handleSingleCourseSignup() {
        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: 'invoke the transition_to_signup_tool'
        };

        agentClient.startNewRun();
        try {
            // Store the single outline in state (and in course_outlines for consistency)
            agentClient.setState({
                ...globalState,
                soco_outline: outlines[0],
                course_outlines: outlines  // Store array for SignupForm compatibility
            });

            await agentClient.runAgent(
                [...messages, userMessage],
                getAllToolDefinitions(tools),
                agentSubscriber
            );
        } catch (error) {
            console.error('Agent execution failed:', error);
            throw error;
        }
    }

    // Handle multiple courses creation
    async function handleMultipleCoursesCreation() {
        // Get only the non-discarded outlines
        const activeOutlines = outlineStatuses
            .filter(item => item.status !== 'discarded')
            .map(item => item.outline);

        if (activeOutlines.length === 0) {
            alert('Please select at least one course to create.');
            return;
        }

        // Get discarded headers for filtering during signup
        const discardedHeaders = outlineStatuses
            .filter(item => item.status === 'discarded')
            .map(item => item.outline.header);

        const userMessage: Message = {
            id: `user_${Date.now()}`,
            role: 'user',
            content: 'invoke the transition_to_signup_tool'
        };

        agentClient.startNewRun();
        try {
            // Store accumulated outlines and discarded headers for signup
            agentClient.setState({
                ...globalState,
                course_outlines: outlines,  // Store all outlines for SignupForm
                discarded_outline_headers: discardedHeaders
            });

            await agentClient.runAgent(
                [...messages, userMessage],
                getAllToolDefinitions(tools),
                agentSubscriber
            );
        } catch (error) {
            console.error('Agent execution failed:', error);
            throw error;
        }
    }

    // ===== RENDER: Single Outline Mode =====
    if (isSingleOutline) {
        return (
            <div>
                <SoCoOutlineView outline={outlines[0]} />
                <Button
                    variant="contained"
                    sx={{ maxWidth: '40em', mt: '2em' }}
                    onClick={handleSingleCourseSignup}
                >
                    Would you like me to create this course now?
                </Button>
            </div>
        );
    }

    // ===== RENDER: Multiple Outlines Mode =====
    return (
        <div className="multiple-outlines-container">
            {hasPartialFailure && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    Generated {metadata.totalGenerated} out of {metadata.totalRequested} requested courses.
                    {metadata.failedTopics.length > 0 && (
                        <> Failed topics: {metadata.failedTopics.join(', ')}</>
                    )}
                </Alert>
            )}

            <Accordion allowMultiple={true} transition transitionTimeout={250}>
                {outlineStatuses.map((item) => (
                    <AccordionItem
                        key={item.id}
                        className={`outline-accordion-item${item.status === 'discarded' ? ' discarded' : ''}`}
                        header={
                            <div className="accordion-header-content">
                                {item.outline.headerImagePath && (
                                    <Box
                                        component="img"
                                        src={item.outline.headerImagePath}
                                        alt={item.outline.header}
                                        className="accordion-header-image"
                                        sx={{
                                            width: 80,
                                            height: 80,
                                            objectFit: 'cover',
                                            borderRadius: 1,
                                            mr: 2
                                        }}
                                    />
                                )}
                                <div className="accordion-header-text">
                                    <Typography variant="h6" component="div">
                                        {item.outline.header}
                                        {item.status === 'discarded' && (
                                            <Typography
                                                component="span"
                                                variant="h6"
                                                sx={{
                                                    ml: 1,
                                                    color: 'text.secondary',
                                                    fontStyle: 'italic'
                                                }}
                                            >
                                                (discarded)
                                            </Typography>
                                        )}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{
                                            mt: 0.5,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical'
                                        }}
                                    >
                                        {item.outline.description}
                                    </Typography>
                                </div>

                                {/* Trash can / Undo button */}
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (item.status === 'discarded') {
                                            handleUndo(item.id);
                                        } else {
                                            handleDiscard(item.id);
                                        }
                                    }}
                                    sx={{
                                        mr: 1,
                                        color: item.status === 'discarded' ? 'primary.main' : 'error.main'
                                    }}
                                >
                                    {item.status === 'discarded' ? (
                                        <Undo fontSize="small" />
                                    ) : (
                                        <Delete fontSize="small" />
                                    )}
                                </IconButton>

                                <KeyboardArrowDown className="accordion-arrow" />
                            </div>
                        }
                    >
                        <div className="accordion-content">
                            <SoCoOutlineView outline={item.outline} />
                        </div>
                    </AccordionItem>
                ))}
            </Accordion>

            <Typography variant="body1" sx={{ mt: 3, mb: 1 }}>
                Your course outlines are ready! Click the button below to start generating these courses.
            </Typography>

            <Button
                variant="contained"
                sx={{ maxWidth: '40em', mt: '2em' }}
                onClick={handleMultipleCoursesCreation}
            >
                Would you like me to create these courses now?
            </Button>
        </div>
    );
}
