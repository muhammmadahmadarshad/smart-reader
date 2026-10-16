import { createContext, useContext, type ReactNode } from 'react';
import { useBookAssistant, type BookAssistant } from './useBookAssistant';
import type { SelectionContextInput } from './types';

const AssistantContext = createContext<BookAssistant | null>(null);

/** Keep drafts and active requests alive when the sidebar changes into a mobile drawer.
 * Only context consumers update while streaming; the PDF does not render on each token.
 */
export function BookAssistantSession({
  bookId,
  visible,
  selection,
  children,
}: {
  bookId: string;
  visible: boolean;
  selection: SelectionContextInput | null;
  children: ReactNode;
}) {
  const assistant = useBookAssistant({ bookId, visible, selection });
  return <AssistantContext.Provider value={assistant}>{children}</AssistantContext.Provider>;
}

export function useAssistantSession(): BookAssistant {
  const assistant = useContext(AssistantContext);
  if (!assistant) throw new Error('The assistant must be rendered inside a book session.');
  return assistant;
}
