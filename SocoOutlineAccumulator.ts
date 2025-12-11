/**
 * Frontend event listener for SoCo outline accumulation.
 *
 * This is a temporary solution (Option B) that listens to ToolCallResultEvent
 * and accumulates outlines in globalState. This bridges the gap until the backend
 * implements Option A (sending accumulated outlines via StateSnapshotEvent).
 *
 * Purpose: Restores outline accumulation functionality after refactoring removed
 * tool-specific code from AgentClientContext.
 */

import { ToolCallResultEvent } from '@ag-ui/core';

export class SocoOutlineAccumulator {
    private updateState: (toolName: string, data: any) => void;
    private getToolNameFromCallId: (toolCallId: string) => string | undefined;
    private accumulatedOutlines: any[] = [];

    constructor(
        updateState: (toolName: string, data: any) => void,
        getToolNameFromCallId: (toolCallId: string) => string | undefined
    ) {
        this.updateState = updateState;
        this.getToolNameFromCallId = getToolNameFromCallId;
    }

    /**
     * Handles tool call result events and accumulates outline data.
     * Call this from the AgentClientContext's handleToolCallResult handler.
     */
    handleToolCallResult(event: ToolCallResultEvent) {
        const toolName = this.getToolNameFromCallId(event.toolCallId);

        console.log('[SocoOutlineAccumulator] Processing event for tool:', toolName, 'toolCallId:', event.toolCallId);

        // Only process outline tools
        if (toolName !== 'soco_outline_tool' && toolName !== 'soco_multiple_outlines_tool') {
            console.log('[SocoOutlineAccumulator] Skipping non-outline tool:', toolName);
            return;
        }

        console.log('[SocoOutlineAccumulator] Processing outline tool result, content length:', event.content?.length);

        try {
            const parsed = JSON.parse(event.content || '{}');
            console.log('[SocoOutlineAccumulator] Parsed content:', parsed);

            console.log('[SocoOutlineAccumulator] Checking conditions - toolName:', toolName, 'parsed.header:', parsed.header, 'parsed.outlines:', parsed.outlines?.length);

            if (toolName === 'soco_outline_tool' && parsed.header) {
                // Single outline
                console.log('[SocoOutlineAccumulator] Matched soco_outline_tool branch');
                const isDuplicate = this.accumulatedOutlines.some((o: any) => o.header === parsed.header);

                if (!isDuplicate) {
                    console.log('[SocoOutlineAccumulator] Adding outline:', parsed.header);
                    this.accumulatedOutlines.push(parsed);
                    this.updateGlobalState();
                } else {
                    console.log('[SocoOutlineAccumulator] Duplicate outline detected, skipping:', parsed.header);
                }
            } else if (toolName === 'soco_multiple_outlines_tool' && parsed.outlines) {
                console.log('[SocoOutlineAccumulator] Matched soco_multiple_outlines_tool branch');
                // Multiple outlines
                const newOutlines = parsed.outlines.filter((newOutline: any) =>
                    !this.accumulatedOutlines.some((existing: any) => existing.header === newOutline.header)
                );

                if (newOutlines.length > 0) {
                    console.log('[SocoOutlineAccumulator] Adding outlines:', newOutlines.map((o: any) => o.header));
                    this.accumulatedOutlines.push(...newOutlines);
                    this.updateGlobalState();
                } else {
                    console.log('[SocoOutlineAccumulator] All outlines are duplicates, skipping');
                }
            }

            console.log('[SocoOutlineAccumulator] Total outlines:', this.accumulatedOutlines.length);
        } catch (e) {
            // Not JSON or not an outline - ignore
            console.debug('[SocoOutlineAccumulator] Failed to parse outline data:', e);
        }
    }

    /**
     * Updates globalState with the accumulated outlines.
     */
    private updateGlobalState() {
        console.log('[SocoOutlineAccumulator] Updating globalState with', this.accumulatedOutlines.length, 'outlines');
        // Use a special key for accumulated outlines
        this.updateState('_soco_accumulated_outlines', this.accumulatedOutlines);
        console.log('[SocoOutlineAccumulator] globalState updated successfully');
    }

    /**
     * Clears accumulated outlines.
     */
    clear() {
        console.log('[SocoOutlineAccumulator] Clearing accumulated outlines');
        this.accumulatedOutlines = [];
        this.updateGlobalState();
    }

    /**
     * Gets the current accumulated outlines.
     */
    getAccumulatedOutlines(): any[] {
        return [...this.accumulatedOutlines];
    }
}
