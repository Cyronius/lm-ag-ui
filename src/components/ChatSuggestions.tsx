import React from 'react';
import { Button, List, ListItem, ListItemText } from '@mui/material';

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

const ChatSuggestions: React.FC<ChatSuggestionsProps> = ({ onSuggestionClick }) => {
  return (
    <List>
      {suggestions.map((suggestion, index) => (
        <ListItem button key={index} onClick={() => onSuggestionClick(suggestion)}>
          <ListItemText primary={suggestion} />
        </ListItem>
      ))}
    </List>
  );
};

export default ChatSuggestions;