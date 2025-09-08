import React, { useRef, useState } from 'react';
import { Box, Button, IconButton } from '@mui/material';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import './ChatSuggestions.css';

interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  "Create a course about...",
  "Create safety training for the role of...",
  "Ask about microlearning",
  "Inquire about compliance training",
  "What integrations does your system have?",
  "Schedule a demo",
  "Training questions"
];


const ChatSuggestions: React.FC<ChatSuggestionsProps> = ({ onSuggestionClick }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
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
        aria-label="scroll left"
        sx={{ 
          padding: { xs: "10px", sm: "20px", md: "40px" }
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
        {suggestions.map((suggestion, index) => (
          <Button
            key={index}
            onClick={() => onSuggestionClick(suggestion)}
            variant="outlined"
            className="suggestion-button"
            sx={{ borderRadius: "16px"}}
          >
            <span className="suggestion-text">{suggestion}</span>
          </Button>
        ))}
      </Box>

      {/* Right scroll button */}
      <IconButton
        onClick={() => scroll('right')}
        disabled={!canScrollRight}
        className="scroll-button scroll-button-right"
        aria-label="scroll right"
        sx={{ 
          padding: { xs: "10px", sm: "20px", md: "40px" }
        }}
      >
        <ArrowForwardIosIcon fontSize="large" />
      </IconButton>
    </Box>
  );
};

export default ChatSuggestions;