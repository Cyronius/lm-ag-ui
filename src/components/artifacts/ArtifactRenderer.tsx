import React from 'react';
import { CalendlyArtifact } from './CalendlyArtifact';
import { ArtifactData } from '../../types/index';

interface ArtifactRendererProps {
  artifacts: Map<string, ArtifactData>;
}

export const ArtifactRenderer: React.FC<ArtifactRendererProps> = ({ artifacts }) => {
  return (
    <div className="artifacts-container">
      {Array.from(artifacts.entries()).map(([id, artifact]) => {
        switch (artifact.type) {
          default:
            return null;
        }
      })}
    </div>
  );
};