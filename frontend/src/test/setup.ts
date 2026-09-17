import '@testing-library/jest-dom/vitest';

// jsdom can give the Document as a focus event's relatedTarget, which a
// browser never does. MUI's focus trap later calls .focus() on it when a
// Dialog closes.
const documentWithFocus = Document.prototype as Document & { focus?: () => void };
documentWithFocus.focus ??= () => {};
