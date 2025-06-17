import React from 'react';
import { Box, Button, ListItemText } from '@mui/material';

interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  "Schedule a demo",
  "Create training content",
  "Ask about microlearning",
  "Inquire about compliance training",
  "Learn about LMS features",
  "Set up an account",
  "Training questions"
];

function getRandomSuggestions(arr: string[], n: number) {
  const shuffled = arr.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

const ChatSuggestions: React.FC<ChatSuggestionsProps> = ({ onSuggestionClick }) => {
  const randomSuggestions = React.useMemo(() => getRandomSuggestions(suggestions, 4), []);
  return (
    <Box display="flex" gap={1} justifyContent="center" mb={1}>
      {randomSuggestions.map((suggestion, index) => (
        <Button key={index} onClick={() => onSuggestionClick(suggestion)} variant="outlined">
          <ListItemText primary={suggestion} />
        </Button>
      ))}
    </Box>
  );
};

export default ChatSuggestions;