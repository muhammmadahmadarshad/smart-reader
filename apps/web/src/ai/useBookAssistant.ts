import { useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { readAssistantStream } from './assistant-stream';
import type { SelectionContextInput } from './types';
import type {
  AssistantMessage,
  Capability,
  Connection,
  Conversation,
  IndexInfo,
} from './assistant-types';

/** Owns request state and server synchronization; UI controls never hold credentials. */
export function useBookAssistant({
  bookId,
  visible,
  selection,
}: {
  bookId: string;
  visible: boolean;
  selection: SelectionContextInput | null;
}) {
  const { message, modal } = App.useApp();
  const query = useQueryClient();
  const prefix = `/ai/books/${bookId}`;
  const capabilities = useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => api<Capability>('/ai/capabilities'),
    enabled: visible,
  });
  const connections = useQuery({
    queryKey: ['ai-connections'],
    queryFn: () => api<Connection[]>('/ai/connections'),
    enabled: visible,
  });
  const index = useQuery({
    queryKey: ['ai-index', bookId],
    queryFn: () => api<IndexInfo>(`${prefix}/index`),
    enabled: visible,
    refetchInterval: (query) =>
      visible && ['QUEUED', 'PROCESSING'].includes(query.state.data?.status || '') ? 3000 : false,
  });
  const conversations = useQuery({
    queryKey: ['ai-conversations', bookId],
    queryFn: () => api<Conversation[]>(`${prefix}/conversations`),
    enabled: visible,
  });
  const preferences = useQuery({
    queryKey: ['ai-preferences'],
    queryFn: () => api<{ connectionId: string | null; model: string | null }>('/ai/preferences'),
    enabled: visible,
  });
  const [connectionId, setConnectionId] = useState('');
  const [model, setModel] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [question, setQuestion] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const [failure, setFailure] = useState('');
  const active = useRef<{ id: string; controller: AbortController } | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const followResponse = useRef(true);
  const connection = connections.data?.find((item) => item.id === connectionId);
  const valid =
    capabilities.data?.generation &&
    connection?.validation === 'VALID' &&
    connection.validatedModels.includes(model);
  const messages = useQuery({
    queryKey: ['ai-messages', bookId, conversationId],
    queryFn: () => api<AssistantMessage[]>(`${prefix}/conversations/${conversationId}`),
    enabled: !!conversationId && visible,
  });
  useEffect(() => {
    if (connectionId || preferences.isPending) return;
    const preferred = connections.data?.find((item) => item.id === preferences.data?.connectionId);
    const initialConnection =
      preferred || connections.data?.find((item) => item.validation === 'VALID');
    if (initialConnection) {
      setConnectionId(initialConnection.id);
      setModel(
        preferences.data?.connectionId === initialConnection.id && preferences.data.model
          ? preferences.data.model
          : initialConnection.model,
      );
    }
  }, [connections.data, preferences.data, preferences.isPending, connectionId]);
  useEffect(() => {
    if (visible && followResponse.current && history.current) {
      history.current.scrollTop = history.current.scrollHeight;
    }
  }, [draft, messages.data, visible, running]);
  useEffect(() => {
    if (selection) setQuestion(selectionQuestion(selection));
  }, [selection]);
  useEffect(() => () => active.current?.controller.abort(), []);
  function selectModel(id: string, nextModel: string) {
    setConnectionId(id);
    setModel(nextModel);
    void api('/ai/preferences', {
      method: 'PUT',
      body: JSON.stringify({ connectionId: id, model: nextModel }),
    }).catch(() => undefined);
  }
  function refreshConversation() {
    void query.invalidateQueries({ queryKey: ['ai-conversations', bookId] });
    void query.invalidateQueries({ queryKey: ['ai-messages', bookId] });
    void query.invalidateQueries({ queryKey: ['ai-capabilities'] });
    void query.invalidateQueries({ queryKey: ['ai-connections'] });
  }
  async function newConversation() {
    const conversation = await api<Conversation>(`${prefix}/conversations`, { method: 'POST' });
    setConversationId(conversation.id);
    refreshConversation();
    return conversation.id;
  }
  async function send() {
    if (
      !valid ||
      !question.trim() ||
      running ||
      active.current ||
      (!selection && !index.data?.ready)
    )
      return;
    setRunning(true);
    setDraft('');
    setFailure('');
    setStatus('Starting');
    followResponse.current = true;
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    let streamedText = '';
    let paintTimer: ReturnType<typeof setTimeout> | undefined;
    active.current = { id: requestId, controller };
    try {
      const id = conversationId || (await newConversation());
      // Snapshot selectors and selection for this request. Later selector changes affect future requests only.
      const payload = {
        requestId,
        conversationId: id,
        connectionId,
        model,
        question,
        ...(selection ? { selection: { ...selection, question } } : {}),
      };
      const response = await fetch(`/api${prefix}/messages`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Kevnex-Request': '1' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.message || 'The request was rejected. Check your connection and try again.',
        );
      }
      let terminal = false;
      for await (const event of readAssistantStream(response)) {
        switch (event.type) {
          case 'status':
            setStatus(event.status);
            break;
          case 'text_delta':
            streamedText += event.text;
            // Coalesce fast token streams. Markdown is rendered once the answer is saved.
            paintTimer ??= setTimeout(() => {
              setDraft(streamedText);
              paintTimer = undefined;
            }, 50);
            break;
          case 'error':
            throw new Error(event.message);
          case 'result':
            terminal = true;
            if (event.message.error) setFailure(event.message.error);
            query.setQueryData<AssistantMessage[]>(['ai-messages', bookId, id], (items = []) => [
              ...items.filter((item) => item.id !== event.message.id),
              event.message,
            ]);
            clearTimeout(paintTimer);
            paintTimer = undefined;
            streamedText = '';
            setDraft('');
            break;
        }
      }
      if (!terminal)
        throw new Error(
          'Response interrupted. Reopen the saved conversation and retry explicitly if needed.',
        );
      setQuestion('');
    } catch (error) {
      setFailure(
        controller.signal.aborted
          ? 'Cancelled. Partial text is incomplete; provider charges may already have been incurred.'
          : (error as Error).message,
      );
    } finally {
      clearTimeout(paintTimer);
      if (streamedText) setDraft(streamedText);
      active.current = null;
      setRunning(false);
      setStatus('');
      refreshConversation();
    }
  }
  const prepare = () =>
    modal.confirm({
      title: 'Prepare the entire book for AI?',
      content:
        'The project embedding service processes extracted text from every page and your later search questions. This uses application quotas. Images and scans need OCR and are not understood.',
      okText: 'Prepare book',
      onOk: async () => {
        try {
          await api(`${prefix}/prepare`, { method: 'POST' });
          void index.refetch();
        } catch (error) {
          message.error((error as Error).message);
        }
      },
    });

  function openConversation(id: string) {
    setConversationId(id);
    setDraft('');
    setFailure('');
    followResponse.current = true;
  }

  function deleteConversation() {
    modal.confirm({
      title: 'Delete conversation?',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api(prefix + '/conversations/' + conversationId, { method: 'DELETE' });
        openConversation('');
        refreshConversation();
      },
    });
  }

  function cancelResponse() {
    const request = active.current;
    if (!request) return;
    void api(prefix + '/requests/' + request.id + '/cancel', { method: 'POST' }).catch(
      () => undefined,
    );
    request.controller.abort();
  }

  async function cancelPreparation() {
    try {
      await api(prefix + '/cancel-index', { method: 'POST' });
      await index.refetch();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  function startConversation() {
    void newConversation().catch((error) => message.error(error.message));
  }

  return {
    capabilities,
    connections,
    index,
    conversations,
    messages,
    connectionId,
    connection,
    model,
    conversationId,
    question,
    setQuestion,
    running,
    status,
    draft,
    failure,
    valid,
    history,
    followResponse,
    selectModel,
    send,
    prepare,
    cancelPreparation,
    cancelResponse,
    openConversation,
    deleteConversation,
    startConversation,
  };
}

export type BookAssistant = ReturnType<typeof useBookAssistant>;

function selectionQuestion(selection: SelectionContextInput): string {
  if (selection.action === 'GIVE_EXAMPLE') return 'Give an illustrative example of this passage.';
  if (selection.language === 'ur') return 'Explain this passage in Urdu.';
  if (selection.action === 'ASK_FOLLOWUP') return '';
  return 'Explain this passage.';
}
