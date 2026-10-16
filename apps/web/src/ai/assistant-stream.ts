import type { AssistantMessage } from './assistant-types';

export type AssistantStreamEvent =
  | { type: 'status'; status: string }
  | { type: 'text_delta'; text: string }
  | { type: 'result'; message: AssistantMessage }
  | { type: 'error'; message: string };

/** Decode streamed POST responses, including events split across network packets. */
export async function* readAssistantStream(
  response: Response,
): AsyncGenerator<AssistantStreamEvent> {
  if (!response.body) {
    throw new Error('No response stream. Reopen the conversation before retrying.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendingLine = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      pendingLine += decoder.decode(value, { stream: !done });
      const lines = pendingLine.split('\n');
      pendingLine = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as AssistantStreamEvent;
      }
      if (done) break;
    }
    // A final newline is optional; never discard a complete terminal event.
    if (pendingLine.trim()) yield JSON.parse(pendingLine) as AssistantStreamEvent;
  } finally {
    reader.releaseLock();
  }
}
