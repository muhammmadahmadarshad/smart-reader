# AI assistant API

All paths below start with `/api/ai`. Every request uses the existing `kevnex_session` HTTP-only cookie. Mutations require `Origin: <APP_ORIGIN>`, `X-Kevnex-Request: 1`, and JSON. Owner identity is taken from the session; client-supplied user/scope fields are rejected. UUID parameters are validated. OpenAPI is also available at `/api/docs`.

| Method/path                                      | Request                                                  | Result                                                                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/capabilities`                              | —                                                        | `{generation, streaming, embeddings, retrieval, connectionsEnabled, reason}`. Retrieval capability is configuration availability, **not** readiness of any book.                           |
| GET `/connections`                               | —                                                        | Safe user-owned connections, masked suffix, validated models/status/time.                                                                                                                  |
| POST `/connections`                              | `{name, provider, model, apiKey?, baseUrl?, streaming?}` | Safe connection. Providers: `openai`, `anthropic`, `gemini`, `ollama`, `compatible`. Does not invoke a model.                                                                              |
| PATCH `/connections/:id`                         | Same connection fields                                   | Replaces configuration, invalidates validation, increments revision. Omitted key retains it; empty string removes it. Endpoint/provider changes require an explicit replacement/empty key. |
| DELETE `/connections/:id`                        | —                                                        | Removes credential/preference references, cancels active work where practical. Does not revoke the provider key.                                                                           |
| GET `/connections/:id/models`                    | —                                                        | Discovered model identifier array; may fail with a manual-entry explanation.                                                                                                               |
| POST `/connections/:id/validate`                 | `{model}`                                                | Makes one small, potentially paid text request and updates validation. Authentication failure marks invalid; quota/transient errors preserve the connection.                               |
| GET `/preferences`                               | —                                                        | `{connectionId,model}` or null values.                                                                                                                                                     |
| PUT `/preferences`                               | `{connectionId,model}`                                   | Saved owner-scoped preference. Does not alter active requests.                                                                                                                             |
| GET `/books/:bookId/index`                       | —                                                        | `{status,ready,available,reason,totalPages,pagesProcessed,chunksEmbedded,totalChunks,coverage,failure,indexId}`.                                                                           |
| POST `/books/:bookId/prepare`                    | —                                                        | Idempotently creates/resumes a run for current immutable book/configuration; returns status.                                                                                               |
| POST `/books/:bookId/cancel-index`               | —                                                        | Cancels queued/active run, clears lease, returns status.                                                                                                                                   |
| GET `/books/:bookId/conversations`               | —                                                        | Latest up to 100 conversations.                                                                                                                                                            |
| POST `/books/:bookId/conversations`              | —                                                        | New conversation.                                                                                                                                                                          |
| GET `/books/:bookId/conversations/:id`           | —                                                        | Up to 200 saved question/answer message records in order.                                                                                                                                  |
| DELETE `/books/:bookId/conversations/:id`        | —                                                        | Deletes conversation/messages and stops active work where practical.                                                                                                                       |
| POST `/books/:bookId/messages`                   | See below                                                | Authenticated NDJSON stream.                                                                                                                                                               |
| POST `/books/:bookId/requests/:requestId/cancel` | —                                                        | Requests cancellation; paid charges may already have occurred.                                                                                                                             |

Processing states are `NOT_PREPARED`, `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `CANCELLED`. Coverage contains `textPages`, `emptyPages`, `failedPages` and human-readable `limitations`. Pages are one-based. Do not infer whole-book text coverage from `READY`: mixed blank/scanned pages remain disclosed separately.

Message request:

```json
{
  "requestId": "<new UUID; retain for transport replay>",
  "conversationId": "<owned conversation UUID>",
  "connectionId": "<owned validated connection UUID>",
  "model": "<validated identifier>",
  "question": "What does the author say about this topic?"
}
```

Optional `selection` enables assistance without embeddings:

```json
{
  "bookId": "<current book UUID>",
  "documentVersion": "<same immutable upload UUID>",
  "selectedText": "Browser-supplied excerpt",
  "pages": { "first": 1, "last": 1 },
  "action": "EXPLAIN",
  "language": "ur"
}
```

Selection supports `EXPLAIN`, `GIVE_EXAMPLE`, `TRANSLATE`, `ASK_FOLLOWUP`; `annotationId`, `question` and `anchors` are optional. Anchors contain the same book/version, `coordinateVersion: 2`, and existing annotation `segments: [{page,rectangles:[{x,y,width,height}]}]` in PDF user-space coordinates. The top-level question is authoritative. Selected text is always labeled browser-supplied, even when its geometry matches an annotation. Oversized primary selections are rejected, not silently trimmed.

Stream content type is `application/x-ndjson`, with no-store caching. Process one JSON object per line:

```json
{"type":"status","status":"Finding relevant passages"}
{"type":"text_delta","text":"Provisional answer text"}
{"type":"result","message":{"id":"...","status":"COMPLETED","answer":"Final answer [S1]","citations":[{"id":"S1","excerpt":"...","source":{"sourceType":"BOOK_TEXT","bookId":"...","documentVersion":"...","sourceTitle":"Actual book title","pages":{"first":3,"last":3}}}],"provider":"...","model":"..."}}
```

Status and text events precede one terminal `result` or `error`. An initial authorization/validation error can carry a non-2xx status. After streaming starts, errors use the terminal event or persisted failed/incomplete message. A disconnected transport must reopen the saved conversation; it must not automatically create another generation. A duplicate request UUID with identical content returns its current saved message (possibly `PENDING`) without another model request. Different content with the same UUID returns 409. Explicit retry uses a new UUID.

Message states: `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`, `INCOMPLETE`. Partial answers are never presented as complete. Citation identifiers and navigation come from the terminal message; provisional text may change during grounding finalization. No internal reasoning, credentials or private prompts appear in status events. Unknown token counts remain null/absent.

Usual error statuses: 400 invalid context/unsupported model, 401 missing session, 403 CSRF failure, 404 resource not owned/found, 409 active request/idempotency conflict, 429 quota/rate/concurrency limit, 503 unavailable AI configuration/provider. Error messages are sanitized. No endpoint allows arbitrary retrieval scope, raw vector search, tool selection or project LLM generation.
