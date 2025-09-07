import React, { useRef, useState } from 'react';
import { Box, Button, IconButton } from '@mui/material';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import LabelIcon from '@mui/icons-material/Label';
import './ChatSuggestions.css';

interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
    "Create onboarding training for the role of…",
    "What makes Learner Mobile different?",
    "How does the authoring tool work?",
    "Start my free trial",    
    "How does Learner Mobile support AI?",
    "What’s Source-to-Course?",
    "How do I set up badges and certificates?",
    "Does Learner Mobile support SCORM?",
    "How do I create role-based learning paths?",
    "What industries use Learner Mobile?",
    "How do you support frontline workers?",
    "Can it deliver video training?",
    "Can I customize the site’s look?",
    "What reports and analytics are included?",
    "How do you make training engaging?",
    "What’s microlearning all about?",
    "Can it integrate with other systems?",
    "What support is offered after launch?",
    "Can it scale as my company grows?",
    "How fast can I build training?",
    "What does onboarding and support look like?",
    "Does it work offline?",
    "What awards have you won?",
    "How does it boost employee retention?",
    "What makes it easy for admins?",
    "What content works best here?",
    "What size companies do you serve?",
    "Can nonprofits use Learner Mobile?",
    "Do AI features cost extra?",
    "How much does it cost?",
    "How long are contracts?",
    "What is Learner Mobile?"
];

const stickySuggestions = [
    "Create a course about...",
    "Schedule a demo with Learner Mobile.",
];

// Randomize the order of the suggestions, while keeping certain ones sticky.
shuffle(suggestions);

// Make sure the sticky ones are always at the front.
suggestions.unshift(...stickySuggestions);

function shuffle(array: string[]) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
}

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
            startIcon={<LabelIcon />}
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