import React, { useRef, useState } from 'react';
import { Box, Button, IconButton } from '@mui/material';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import './ChatSuggestions.css';

interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  "Schedule a demo",
  "Create training content",
  "Ask about microlearning",
  "Inquire about compliance training",
  "What integrations does your system have?",
  "Create a course about...",
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const randomSuggestions = React.useMemo(() => getRandomSuggestions(suggestions, 6), []);

  const checkScrollButtons = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      const newScrollLeft = direction === 'left'
        ? scrollContainerRef.current.scrollLeft - scrollAmount
        : scrollContainerRef.current.scrollLeft + scrollAmount;

      scrollContainerRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  React.useEffect(() => {
    checkScrollButtons();
    const handleResize = () => checkScrollButtons();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Box className="suggestions-wrapper">
      {/* Left scroll button */}
      <IconButton
        onClick={() => scroll('left')}
        disabled={!canScrollLeft}
        className="scroll-button scroll-button-left"
        sx={{ 
          padding: { xs: "10px", sm: "40px" }
        }}
      >
        <ArrowBackIosIcon fontSize="large" />
      </IconButton>

      {/* Scrollable suggestions container */}
      <Box
        ref={scrollContainerRef}
        onScroll={checkScrollButtons}
        className="suggestions-scroll-container"
      >
        {randomSuggestions.map((suggestion, index) => (
          <Button
            key={index}
            onClick={() => onSuggestionClick(suggestion)}
            variant="outlined"
            className="suggestion-button"
          >
            {suggestion}
          </Button>
        ))}
      </Box>

      {/* Right scroll button */}
      <IconButton
        onClick={() => scroll('right')}
        disabled={!canScrollRight}
        className="scroll-button scroll-button-right"
        sx={{ 
          padding: { xs: "10px", sm: "40px" }
        }}
      >
        <ArrowForwardIosIcon fontSize="large" />
      </IconButton>
    </Box>
  );
};

export default ChatSuggestions;