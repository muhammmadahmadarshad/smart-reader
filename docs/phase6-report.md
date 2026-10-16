# Phase 6 completion report

Implemented the AI book assistant across NestJS and React while retaining TypeORM, private PDF storage, existing authentication/CSRF and the forest-green Ant Design reader.

- **Connections:** encrypted named user connections for OpenAI, Claude, Gemini, Ollama and OpenAI-compatible protocols; model discovery/manual validation, preferences, masked keys, replacement/removal and custom-endpoint restrictions. There is no project LLM fallback.
- **Whole-book RAG:** project-managed `text-embedding-3-small`, token-bounded chunks, page-specific source spans, durable PostgreSQL jobs/leases, resumed batches, coverage disclosures, cancellation, atomic activation, exact scoped pgvector search and incompatible-index exclusion.
- **Assistant:** explicit LangGraph workflows, selection actions including Urdu, book Q&A, bounded follow-up history, persisted conversations, authenticated POST streaming, idempotency, incomplete-response handling, citations and existing PDF page/geometry navigation.
- **Operations:** three versioned Phase 6 migrations, page/query/generation quota reservations, separate project/user usage, deletion cleanup, configuration examples, local encryption-key setup, [deployment/architecture guide](ai-assistant.md) and [API reference](ai-api.md).

Verification uses local PostgreSQL/pgvector and private storage, with no paid AI service:

| Check              | Result                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| API tests          | 92 passed; one live-provider test intentionally skipped                                                                |
| Chromium workflows | 13 passed, including existing reader, annotations, bookmarks, notes and progress                                       |
| Production builds  | NestJS and React builds pass; existing Vite bundle-size advisory remains                                               |
| Real extraction    | First/middle/final text pages and scanned-only fixture checked                                                         |
| Protocol fixtures  | All five native/compatible adapters exercised without external AI calls                                                |
| Grounding fixture  | Expected source pages, source-supported answer content, follow-up context and insufficient-evidence abstention checked |
| Database           | All eight repository migrations applied locally; existing data preserved                                               |

**Live providers verified: none.** The opt-in smoke test requires explicit test credentials and acknowledgement of provider charges. Protocol fixtures do not establish real-model answer quality; calibrate retrieval thresholds and evaluate claim-to-source grounding on representative books before deployment.

Known boundaries: no OCR/image understanding, comprehensive summaries, exhaustive occurrence search, agents, model-selected tools or persistent graph checkpoints. PostgreSQL uses exact scoped vector search; approximate indexes require measured recall/performance work. No independent notebooks exist in this repository, so notebook saving is documented as an integration point; existing book notes are preserved. A crash after an external embedding call succeeds but before its batch commits can repeat that uncommitted batch. Native Gemini uses its fixed official SDK transport rather than the custom-endpoint fetch guard.

Local credential encryption is configured. Add your user LLM connection in **AI Settings**. Whole-book preparation also needs the project's embedding key in the server environment. Adding a chat key alone does not mark any book ready or enable retrieval.
