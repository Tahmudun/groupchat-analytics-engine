/**
 * Words that may never act as (or fuzzy-match) a member alias, no matter
 * what someone's username or nickname is. Live-data lesson: the chat has
 * members literally named "A", "Him", "tears", and "Skull" — matching those
 * as mentions produced 200k+ false positives (33% of all messages).
 *
 * Tokens in this set are also excluded from fuzzy matching, which stops
 * dictionary words from typo-matching handles ("thanks" -> "thane").
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  // articles / pronouns / prepositions / auxiliaries
  'a', 'an', 'the', 'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'you',
  'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its',
  'they', 'them', 'their', 'theirs', 'this', 'that', 'these', 'those', 'who',
  'whom', 'whose', 'which', 'what', 'where', 'when', 'why', 'how', 'am', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'will', 'would', 'shall', 'should', 'can',
  'could', 'may', 'might', 'must', 'ought', 'to', 'of', 'in', 'on', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off',
  'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all',
  'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'and', 'but', 'or', 'if', 'because', 'as', 'until', 'while', 'also', 'now',
  // common conversational words seen colliding with member aliases
  'hi', 'hey', 'yo', 'ok', 'okay', 'yes', 'yeah', 'yea', 'nah', 'no', 'well',
  'like', 'get', 'got', 'go', 'going', 'gone', 'come', 'came', 'know', 'knew',
  'think', 'thought', 'say', 'said', 'see', 'saw', 'look', 'want', 'need',
  'make', 'made', 'take', 'took', 'time', 'day', 'night', 'today', 'tomorrow',
  'yesterday', 'good', 'bad', 'new', 'old', 'big', 'small', 'right', 'wrong',
  'dude', 'man', 'guy', 'guys', 'girl', 'people', 'thing', 'things', 'stuff',
  'way', 'back', 'still', 'even', 'much', 'many', 'one', 'two', 'first',
  'last', 'next', 'never', 'always', 'sometimes', 'maybe', 'really', 'actually',
  'literally', 'thanks', 'thank', 'please', 'sorry', 'love', 'hate', 'him',
  'hope', 'tears', 'skull', 'block', 'don', 'block', 'dead', 'crying', 'wait',
  'stop', 'let', 'lets', 'gonna', 'wanna', 'gotta', 'finna', 'kinda', 'sorta',
  'ima', 'every',
  'lol', 'lmao', 'lmfao', 'omg', 'wtf', 'idk', 'ikr', 'smh', 'fr', 'ong',
  'bro', 'bruh', 'sis', 'fam', 'bestie', 'chat', 'group', 'send', 'sent',
  'call', 'video', 'photo', 'pic', 'message', 'messages', 'reply', 'react',
]);
