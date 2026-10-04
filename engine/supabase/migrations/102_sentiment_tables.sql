-- 102: Mention extraction + per-mention sentiment. Two tables because
-- mentions are cheap and recomputable locally while sentiments cost LLM
-- calls and are cached by model_version.

CREATE TABLE message_mentions (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id           TEXT NOT NULL REFERENCES chats(id),
    message_id        TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    member_username   TEXT NOT NULL,
    alias_matched     TEXT NOT NULL,
    confidence        REAL NOT NULL,
    offset_in_message INT  NOT NULL,
    UNIQUE (message_id, member_username, offset_in_message)
);
CREATE INDEX idx_mentions_chat_member ON message_mentions (chat_id, member_username);
CREATE INDEX idx_mentions_message     ON message_mentions (message_id);
ALTER TABLE message_mentions ENABLE ROW LEVEL SECURITY;

CREATE TABLE mention_sentiments (
    message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    member_username TEXT NOT NULL,
    chat_id         TEXT NOT NULL REFERENCES chats(id),
    sentiment_score REAL NOT NULL CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
    sentiment_label TEXT NOT NULL CHECK (sentiment_label IN ('positive', 'neutral', 'negative', 'ironic')),
    confidence      REAL NOT NULL,
    model_version   TEXT NOT NULL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, member_username, model_version)
);
CREATE INDEX idx_sentiments_chat_member ON mention_sentiments (chat_id, member_username);
ALTER TABLE mention_sentiments ENABLE ROW LEVEL SECURITY;
