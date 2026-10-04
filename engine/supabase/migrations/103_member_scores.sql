-- 103: Daily member score time series ("stock price"). One row per
-- (chat, member, day). scoring_version lets a formula bump trigger a
-- clean rescore without deleting history mid-flight.

CREATE TABLE member_scores (
    chat_id              TEXT NOT NULL REFERENCES chats(id),
    member_username      TEXT NOT NULL,
    date                 DATE NOT NULL,
    score                REAL NOT NULL,
    activity_component   REAL NOT NULL,
    sentiment_component  REAL NOT NULL,
    reaction_component   REAL NOT NULL,
    engagement_component REAL NOT NULL,
    longevity_component  REAL NOT NULL,
    scoring_version      INT  NOT NULL,
    computed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chat_id, member_username, date)
);
CREATE INDEX idx_member_scores_chat_date ON member_scores (chat_id, date);
ALTER TABLE member_scores ENABLE ROW LEVEL SECURITY;
