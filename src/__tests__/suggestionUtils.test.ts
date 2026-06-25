import { describe, it, expect } from 'vitest';
import { groupSuggestionsByCategory } from '../suggestionUtils';
import type { Suggestion } from '../index';

const s = (suggestion: string, isPriority = false): Suggestion => ({ suggestion, isPriority });

describe('groupSuggestionsByCategory', () => {
    it('groups suggestions by category, preserving first-seen order', () => {
        const input: Suggestion[] = [
            s('Create|Create a learner reflection activity'),
            s('Create|Create a summary of key takeaways'),
            s('Change|Change the tone to be conversational'),
            s('Add|Add an interactive hotspot element'),
            s('Transform|Transform into a step-by-step guide'),
            s('Review|Review for clarity and understanding'),
            s('Create|Create a knowledge check for learners'),
        ];

        const groups = groupSuggestionsByCategory(input);

        expect(groups.map(g => g.category)).toEqual([
            'Create',
            'Change',
            'Add',
            'Transform',
            'Review',
        ]);
        // Create keeps all three options in input order, even though a later
        // Create row appears after other categories.
        expect(groups[0].suggestions.map(o => o.text)).toEqual([
            'Create a learner reflection activity',
            'Create a summary of key takeaways',
            'Create a knowledge check for learners',
        ]);
    });

    it('splits on the first separator only — text may contain a pipe', () => {
        const groups = groupSuggestionsByCategory([s('Change|Change reading level to A|B')]);
        expect(groups).toHaveLength(1);
        expect(groups[0].suggestions[0].text).toBe('Change reading level to A|B');
    });

    it('trims whitespace around category and text', () => {
        const groups = groupSuggestionsByCategory([s('  Create  |   Create something   ')]);
        expect(groups[0].category).toBe('Create');
        expect(groups[0].suggestions[0].text).toBe('Create something');
    });

    it('drops entries with no separator, empty category, or empty text', () => {
        const groups = groupSuggestionsByCategory([
            s('No separator here'),
            s('|missing category'),
            s('Create|'),
            s('Create|   '),
            s('Create|Valid one'),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].category).toBe('Create');
        expect(groups[0].suggestions.map(o => o.text)).toEqual(['Valid one']);
    });

    it('preserves isPriority and the backend priority-first order within a category', () => {
        const groups = groupSuggestionsByCategory([
            s('Create|Priority one', true),
            s('Create|Normal one', false),
        ]);
        expect(groups[0].suggestions).toEqual([
            { text: 'Priority one', isPriority: true },
            { text: 'Normal one', isPriority: false },
        ]);
    });

    it('returns [] for null, undefined, or empty input', () => {
        expect(groupSuggestionsByCategory(null)).toEqual([]);
        expect(groupSuggestionsByCategory(undefined)).toEqual([]);
        expect(groupSuggestionsByCategory([])).toEqual([]);
    });
});
