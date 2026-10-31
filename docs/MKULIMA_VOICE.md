# Mkulima voice input (xAI STT)

- `POST /api/v1/ai/voice` (JWT; 6 requests/min; multipart field `audio`; max 2 MB and 60 s; optional `language` hint). Returns `{transcript, language, language_source, duration}`.
- Uses only xAI STT (`/v1/stt`, `grok-voice-transcribe-2.0`) via `AI_API_KEY`/`AI_BASE_URL`. Audio is held in memory, never written to disk or the DB, and zero-filled after use.
- Enabled only when `AI_ASSISTANT_ENABLED=true`, `AI_API_KEY` is set and `AI_VOICE_ENABLED` is not `false`.
- Nothing is sent automatically: the app shows the transcript in an editable box and only sends it to `/ai/chat` when the user taps Send. The `language` value is passed to chat so Mkulima replies in Swahili/Sheng.
- PINs are never accepted by voice or chat. Payments and bookings still require the in-app PIN prompt, and the tools and caps are unchanged.
- Swahili: xAI STT does not list Swahili as supported and labels Swahili audio `en`, so a word-list heuristic relabels it `sw` (`language_source: heuristic`). In tests (TTS-synthesised clips, not human speech) most words were correct, with word-split and spelling errors ("Nita futi" for "Nitafutie", "Bay Nafu" for "bei nafuu"). Sheng was understandable but rougher. This needs testing with real speakers.
