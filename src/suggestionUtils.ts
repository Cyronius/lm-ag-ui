/**
 * Group flat agent suggestions into labeled categories.
 *
 * The backend stores each suggestion as a single string with no category field
 * (see `Suggestion`). To support category-grouped UIs (e.g. quick-action chips),
 * the category is encoded into the suggestion text with a `|` separator:
 *
 *     "Create|Create a learner reflection activity"
 *      ^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *      category                text
 *
 * This module owns that convention so every consumer (lm-admin, smarketing, …)
 * groups identically. It is presentation-neutral: it returns plain
 * category/text groups, not any app's chip/menu types.
 */
import type { Suggestion } from './index';

/** Separator between the category and the suggestion text within a stored suggestion. */
export const SUGGESTION_CATEGORY_SEPARATOR = '|';

export interface CategorizedSuggestion {
    /** Suggestion text with the `Category|` prefix removed, trimmed. */
    text: string;
    isPriority: boolean;
}

export interface SuggestionGroup {
    /** Trimmed category label. */
    category: string;
    suggestions: CategorizedSuggestion[];
}

/**
 * Group suggestions by their leading `Category|` prefix, preserving the
 * first-seen order of both categories and the items within each. Input is
 * already priority-ordered by the backend, so priority items surface first
 * naturally — no extra sort is applied.
 *
 * Entries with no separator, an empty category, or empty text are dropped
 * (they cannot form a labeled group). Returns `[]` when nothing is valid.
 */
export function groupSuggestionsByCategory(
    suggestions: Suggestion[] | null | undefined,
): SuggestionGroup[] {
    const groups: SuggestionGroup[] = [];
    const byCategory = new Map<string, SuggestionGroup>();

    for (const s of suggestions ?? []) {
        const raw = s?.suggestion;
        if (typeof raw !== 'string') continue;

        const sep = raw.indexOf(SUGGESTION_CATEGORY_SEPARATOR);
        if (sep === -1) continue;

        const category = raw.slice(0, sep).trim();
        // Split on the FIRST separator only, so the text may itself contain `|`.
        const text = raw.slice(sep + 1).trim();
        if (!category || !text) continue;

        let group = byCategory.get(category);
        if (!group) {
            group = { category, suggestions: [] };
            byCategory.set(category, group);
            groups.push(group);
        }
        group.suggestions.push({ text, isPriority: !!s.isPriority });
    }

    return groups;
}
