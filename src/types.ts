// filepath: /smarketing-mui/smarketing-mui/src/types/index.ts

// export interface Message {
//   id: string;
//   content: string;
//   sender: 'user' | 'bot';
//   timestamp: Date;
// }

export interface ChatInterfaceProps {
  onBack?: () => void;
}

export interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

export interface ChatEvent {
  content: Content;
  id: string;
  timestamp: Date;
}

export interface Content {
  parts?: Part[];
  role?: string | null;
}

export interface Part {
    text?: string;
    functionResponse?: any;
    functionCall?: any;
}