import React from 'react';

interface CalendlyArtifactProps {
  url: string;
  height?: number;
}

export const CalendlyArtifact: React.FC<CalendlyArtifactProps> = ({ url, height = 600 }) => {
  return (
    <div 
      className="artifact-container" 
      style={{ 
        margin: '16px 0', 
        borderRadius: '8px', 
        overflow: 'hidden',
        border: '1px solid #e0e0e0'
      }}
    >
      <div 
        style={{ 
          background: '#f5f5f5', 
          padding: '12px', 
          fontSize: '14px', 
          fontWeight: 'bold',
          borderBottom: '1px solid #e0e0e0'
        }}
      >
        📅 Calendly Scheduling
      </div>
      <iframe
        src={url}
        width="100%"
        height={height}
        frameBorder="0"
        title="Calendly Scheduling"
        style={{ display: 'block' }}
      />
    </div>
  );
};