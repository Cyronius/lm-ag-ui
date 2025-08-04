import React from 'react';
import { CalendlyArtifact } from './CalendlyArtifact';
import { ArtifactData } from '../../types/index';

interface ArtifactRendererProps {
  artifacts: Map<string, ArtifactData>;
}

export const ArtifactRenderer: React.FC<ArtifactRendererProps> = ({ artifacts }) => {
  // Use InlineWidget for Calendly artifacts, matching chat message style
  // ...existing code...
  // Import InlineWidget from react-calendly
  // ...existing code...
  return (
    <div className="artifacts-container">
      {Array.from(artifacts.entries()).map(([id, artifact]) => {
        switch (artifact.type) {
          case 'calendly':
            return (
              <div key={id} className="message assistant calendly-message" style={{ margin: '16px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                <div className="bot-icon">
                  <img src="gabe-bot.png" alt="Bot Icon" className="bot-icon" />
                </div>
                <div>{artifact.url}</div>
                <div className="message-content assistant" style={{ width: '100%', padding: 0 }}>
                  {/* Use InlineWidget for Calendly */}
                  {/* <InlineWidget url={artifact.url} styles={{ height: artifact.height || 600, width: '100%' }} /> */}
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};