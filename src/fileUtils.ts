/**
 * Utility for converting File objects to ag-ui BinaryInputContent parts.
 *
 * This enables the inline base64 strategy for file attachments — files are
 * read client-side and embedded directly in the message content array,
 * requiring no custom upload endpoint.
 *
 * For large files, consider the URL reference strategy instead: upload files
 * to your own storage and construct BinaryInputContent with the `url` field.
 */

import type { BinaryInputContent } from '@ag-ui/client';

/**
 * Read an array of File objects and return ag-ui BinaryInputContent parts
 * with inline base64-encoded data.
 */
export async function filesToBinaryContent(files: File[]): Promise<BinaryInputContent[]> {
    return Promise.all(files.map(file => fileToBinaryContent(file)));
}

function fileToBinaryContent(file: File): Promise<BinaryInputContent> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            // Strip the "data:<mime>;base64," prefix to get raw base64
            const base64 = dataUrl.split(',')[1];
            resolve({
                type: 'binary',
                mimeType: file.type || 'application/octet-stream',
                data: base64,
                filename: file.name,
            });
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
