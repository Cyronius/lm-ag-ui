// filepath: /smarketing-mui/smarketing-mui/src/types/index.ts

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export interface ChatInterfaceProps {
  onBack?: () => void;
}

export interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}