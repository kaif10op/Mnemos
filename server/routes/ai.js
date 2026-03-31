const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const NodeCache = require('node-cache');
const crypto = require('crypto');

// Setup response cache (5 minute TTL)
const aiCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Rate Limiting — 30 requests per minute for power usage
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { msg: 'Too many AI requests, please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Configure Providers and Models
const PROVIDERS = [
  {
    name: 'Groq',
    apiKey: process.env.GROQ_API_KEY,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama3-8b-8192',
    format: 'openai'
  },
  {
    name: 'Cerebras',
    apiKey: process.env.CEREBRAS_API_KEY,
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama3.1-8b',
    format: 'openai'
  },
  {
    name: 'xAI',
    apiKey: process.env.XAI_API_KEY,
    url: 'https://api.x.ai/v1/chat/completions',
    model: 'grok-beta', 
    format: 'openai'
  },
  {
    name: 'Google',
    apiKey: process.env.GOOGLE_AI_KEY,
    url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_AI_KEY}`,
    format: 'gemini'
  },
  {
    name: 'OpenRouter',
    apiKey: process.env.OPENROUTER_API_KEY,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.1-8b-instruct:free',
    format: 'openai'
  }
];

const getAvailableProviders = () => PROVIDERS.filter(p => !!p.apiKey);

// Unified LLM call with provider fallback
async function askAI(systemPrompt, userPrompt, temperature = 0.5, maxTokens = 4096) {
  const providers = getAvailableProviders();
  if (providers.length === 0) throw new Error('No AI providers configured.');

  const errors = [];

  for (const provider of providers) {
    try {
      console.log(`[AI] Trying ${provider.name}...`);
      let responseText = '';

      if (provider.format === 'openai') {
        const response = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature,
            max_tokens: maxTokens
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        responseText = data.choices && data.choices[0] && data.choices[0].message.content;
      } 
      else if (provider.format === 'gemini') {
        const response = await fetch(provider.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]}],
            generationConfig: { temperature, maxOutputTokens: maxTokens }
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        responseText = data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text;
      }

      if (!responseText) throw new Error('Empty response');
      console.log(`[AI] Success with ${provider.name}`);
      return responseText.trim();

    } catch (err) {
      console.error(`[AI] ${provider.name} failed:`, err.message);
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  throw new Error(`All AI providers failed. ${errors.join(' | ')}`);
}

function getCacheKey(type, content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `ai_${type}_${hash}`;
}

// @route   POST api/ai/complete
router.post('/complete', auth, aiLimiter, async (req, res) => {
  const { prompt, context, taskId } = req.body;
  if (!prompt && !context) return res.status(400).json({ msg: 'Missing prompt or context' });

  try {
    const systemPrompt = "You are Mnemos AI, an intelligent assistant built into a note-taking application. Respond concisely and effectively.";
    const userPrompt = context ? `Context from my notes:\n"${context}"\n\nTask:\n${prompt}` : prompt;
    
    const cacheKey = getCacheKey('complete', userPrompt);
    const cached = aiCache.get(cacheKey);
    if (cached) return res.json({ result: cached, cached: true });

    const result = await askAI(systemPrompt, userPrompt, 0.7);
    aiCache.set(cacheKey, result);
    res.json({ result, cached: false });
  } catch (error) {
    console.error('[AI /complete] Error:', error);
    res.status(500).json({ msg: 'AI processing failed', details: error.message });
  }
});

// ============================================================
//  THE AGENT — Multi-Action Pipeline
// ============================================================
router.post('/agent', auth, aiLimiter, async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ msg: 'Missing prompt' });

  try {
    const systemPrompt = `You are the Mnemos Agentic Editor. You ALWAYS return a JSON object with ONE key: "actions" — an array of action objects. NEVER return a single object; always wrap in {"actions":[...]}.

Each action object has: "action" (required), "text", "title", "tags", "targetText", "format", "color", "isBg", "url", "folderName", "searchQuery" (all optional).

DO NOT wrap output in markdown. Return ONLY raw JSON.

AVAILABLE ACTIONS:
- REPLACE_ALL: Rewrite entire document. "text" = full HTML. Keep existing links/images unless told to remove.
- APPEND_BOTTOM / INSERT_TOP: Add content. "text" = HTML to insert.
- CREATE_NOTE: New note. "title", "text" (HTML), "folderName" (optional, auto-created if missing).
- CREATE_RICH_NOTE: Same but produce extremely detailed HTML: tables, images (source.unsplash.com), code blocks, diagrams, blockquotes.
- UPDATE_TITLE: "title" = new title.
- ADD_TAG / REMOVE_TAG: "tags" = comma-separated tags to add/remove.
- FORMAT_TEXT: "targetText" = exact text, "format" = bold|italic|underline|strikeThrough|h1|h2|h3|ul|ol|checklist.
- CHANGE_COLOR: "targetText", "color" (CSS color), "isBg" (true=highlight, false=text color).
- INSERT_IMAGE: "text" = <img src="https://source.unsplash.com/800x400/?keyword" alt="..." style="max-width:100%;border-radius:8px;margin:8px 0;">.
- INSERT_LINK: "targetText", "url".
- GENERATE_TABLE: "text" = HTML <table> with inline styles.
- GENERATE_LIST: "text" = HTML <ul> or <ol>.
- INSERT_CODE_BLOCK: "text" = code in <pre><code> tags with styling.
- INSERT_CHECKLIST: "text" = HTML <ul> with <li><input type="checkbox"> items.
- INSERT_BLOCKQUOTE: "text" = <blockquote> with inline styles.
- INSERT_MERMAID: "text" = raw Mermaid.js syntax.
- TRANSLATE_TEXT: "targetText" = original, "text" = translated.
- FIX_GRAMMAR: Like REPLACE_ALL but only fix grammar/spelling. Preserve HTML structure.
- SUMMARIZE_INLINE: Append summary at bottom. "text" = structured HTML.
- CREATE_FOLDER: "title" = folder name.
- MOVE_NOTE: "folderName" = target folder (auto-created if missing).
- DUPLICATE_NOTE: Clone current note with "(Copy)" suffix.
- DELETE_NOTE / PIN_NOTE: System commands.
- CHANGE_THEME_DARK / CHANGE_THEME_LIGHT: Toggle UI themes.
- SEARCH_NOTES: "searchQuery" = keyword. Filters sidebar.
- OPEN_NOTE: "searchQuery" = title/keyword to find and open.
- LIST_NOTES: Lists all notes. "folderName" optional.
- FILTER_BY_TAG: "tags" = tag to filter by.
- SORT_NOTES: "searchQuery" = newest|oldest|alphabetical|most-content.
- FIND_AND_UPDATE: "searchQuery" = keyword to find note, "text" = content to append.
- CREATE_FLASHCARDS: Generate flashcards from current document.
- EXPORT_PDF: Export current note as PDF.
- CHAT: Conversational response. "text" = your message.

MULTI-STEP EXAMPLE — "Create 3 folders with 2 notes each":
{"actions":[
  {"action":"CREATE_FOLDER","title":"Work"},
  {"action":"CREATE_NOTE","title":"Meeting Notes","text":"<h2>Weekly Standup</h2><p>Agenda items...</p>","folderName":"Work"},
  {"action":"CREATE_NOTE","title":"Projects","text":"<h2>Active Projects</h2><ul><li>Project Alpha</li></ul>","folderName":"Work"},
  {"action":"CREATE_FOLDER","title":"Personal"},
  {"action":"CREATE_NOTE","title":"Goals","text":"<h2>2024 Goals</h2>","folderName":"Personal"},
  {"action":"CREATE_NOTE","title":"Reading List","text":"<h2>Books</h2>","folderName":"Personal"},
  {"action":"CREATE_FOLDER","title":"Study"},
  {"action":"CREATE_NOTE","title":"CS Notes","text":"<h2>Data Structures</h2>","folderName":"Study"},
  {"action":"CREATE_NOTE","title":"Math Notes","text":"<h2>Calculus</h2>","folderName":"Study"}
]}

RULES:
- ALWAYS return {"actions":[...]} even for single actions like {"actions":[{"action":"CHAT","text":"Hello!"}]}.
- For multi-step tasks, return ALL steps in one array.
- Order matters: create folders BEFORE notes that go in them.
- Never include [METADATA:...] in output text.
- For REPLACE_ALL/FIX_GRAMMAR, output only document HTML.
- For CREATE_RICH_NOTE, produce beautiful detailed docs with headers, tables, Unsplash images, code blocks.

Return ONLY valid JSON.`;

    const userPrompt = context 
      ? `Current Document Content:\n"${context}"\n\nUser Request:\n${prompt}` 
      : `User Request: ${prompt}\n\n(No document context provided)`;
    
    // No cache for agent — results depend on context
    const result = await askAI(systemPrompt, userPrompt, 0.2);
    const cleanedJsonString = result.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    let actions = [];
    
    try {
      const parsed = JSON.parse(cleanedJsonString);
      
      // Normalize any response shape into an array
      if (Array.isArray(parsed.actions)) {
        actions = parsed.actions;
      } else if (Array.isArray(parsed)) {
        actions = parsed;
      } else if (parsed.action) {
        // Single action object — wrap it
        actions = [parsed];
      } else if (parsed.operations && Array.isArray(parsed.operations)) {
        // Legacy BATCH_OPERATIONS support
        actions = parsed.operations;
      } else {
        actions = [{ action: 'CHAT', text: result }];
      }
    } catch(err) {
      console.warn('[AI /agent] JSON parse failed. Regex fallback.');
      
      let action = 'CHAT';
      let text = result;
      
      const actionMatch = cleanedJsonString.match(/"action"\s*:\s*"([^"]+)"/i);
      if (actionMatch) action = actionMatch[1];
      const textMatch = cleanedJsonString.match(/"text"\s*:\s*"([\s\S]*?)"\s*[,}]/i);
      if (textMatch) text = textMatch[1];
      
      const fallback = { action, text };
      
      const urlMatch = cleanedJsonString.match(/"url"\s*:\s*"([^"]+)"/i);
      if (urlMatch) fallback.url = urlMatch[1];
      const targetMatch = cleanedJsonString.match(/"targetText"\s*:\s*"([^"]+)"/i);
      if (targetMatch) fallback.targetText = targetMatch[1];
      const formatMatch = cleanedJsonString.match(/"format"\s*:\s*"([^"]+)"/i);
      if (formatMatch) fallback.format = formatMatch[1];
      const colorMatch = cleanedJsonString.match(/"color"\s*:\s*"([^"]+)"/i);
      if (colorMatch) fallback.color = colorMatch[1];
      const titleMatch = cleanedJsonString.match(/"title"\s*:\s*"([^"]+)"/i);
      if (titleMatch) fallback.title = titleMatch[1];
      const tagsMatch = cleanedJsonString.match(/"tags"\s*:\s*"([^"]+)"/i);
      if (tagsMatch) fallback.tags = tagsMatch[1];
      const folderMatch = cleanedJsonString.match(/"folderName"\s*:\s*"([^"]+)"/i);
      if (folderMatch) fallback.folderName = folderMatch[1];
      const searchMatch = cleanedJsonString.match(/"searchQuery"\s*:\s*"([^"]+)"/i);
      if (searchMatch) fallback.searchQuery = searchMatch[1];
      
      actions = [fallback];
    }
    
    // Validate each action
    const validActions = ['REPLACE_ALL', 'APPEND_BOTTOM', 'INSERT_TOP', 'CREATE_NOTE', 'CREATE_RICH_NOTE', 'UPDATE_TITLE', 'ADD_TAG', 'FORMAT_TEXT', 'CHANGE_COLOR', 'INSERT_IMAGE', 'INSERT_LINK', 'DELETE_NOTE', 'PIN_NOTE', 'CHANGE_THEME_DARK', 'CHANGE_THEME_LIGHT', 'GENERATE_TABLE', 'TRANSLATE_TEXT', 'GENERATE_LIST', 'FIX_GRAMMAR', 'SUMMARIZE_INLINE', 'CREATE_FOLDER', 'MOVE_NOTE', 'DUPLICATE_NOTE', 'REMOVE_TAG', 'INSERT_CODE_BLOCK', 'INSERT_CHECKLIST', 'INSERT_BLOCKQUOTE', 'INSERT_MERMAID', 'CREATE_FLASHCARDS', 'EXPORT_PDF', 'SEARCH_NOTES', 'OPEN_NOTE', 'LIST_NOTES', 'FILTER_BY_TAG', 'SORT_NOTES', 'FIND_AND_UPDATE', 'CHAT'];
    
    actions = actions.map(a => {
      if (!validActions.includes(a.action)) a.action = 'CHAT';
      return a;
    });

    // Return the actions array
    res.json({ agent: { actions } });
  } catch (error) {
    console.error('[AI /agent] Error:', error);
    res.status(500).json({ msg: 'Agent processing failed', details: error.message });
  }
});

// @route   POST api/ai/summarize
router.post('/summarize', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content to summarize' });

  try {
    const cacheKey = getCacheKey('summarize', content);
    const cached = aiCache.get(cacheKey);
    if (cached) return res.json({ result: cached, cached: true });

    const systemPrompt = "You are a professional summarizer. Extract the core points, action items (if any), and decisions into a very concise executive summary. Use bullet points where appropriate. Do not include pleasantries.";
    const userPrompt = `Summarize the following notes:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.4);
    aiCache.set(cacheKey, result);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ msg: 'Summarization failed', details: error.message });
  }
});

// @route   POST api/ai/tags
router.post('/tags', auth, aiLimiter, async (req, res) => {
  const { content, existingTags } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content to tag' });

  try {
    const cacheKey = getCacheKey('tags', content);
    const cached = aiCache.get(cacheKey);
    if (cached) return res.json({ tags: JSON.parse(cached), cached: true });

    const systemPrompt = "Analyze the text and provide exactly 3-5 relevant, short tags. Try to reuse provided existing tags if highly relevant, but feel free to suggest new ones. Return the output as a clean, comma-separated list of words with no # symbols, no bullet points, and no extra text.";
    const userPrompt = `Existing tags in user's workspace: ${existingTags ? existingTags.join(', ') : 'none'}\n\nContent to tag:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.3);
    const tags = result.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t.length < 20);
    aiCache.set(cacheKey, JSON.stringify(tags));
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ msg: 'Tagging failed', details: error.message });
  }
});

// @route   POST api/ai/actions
router.post('/actions', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content to analyze' });

  try {
    const cacheKey = getCacheKey('actions', content);
    const cached = aiCache.get(cacheKey);
    if (cached) return res.json({ result: cached, cached: true });

    const systemPrompt = "Extract all explicit and implicit action items from the following meeting notes. Format them as a clear checkbox list. If an owner or due date is mentioned, include it. If no action items are found, explicitly say so.";
    const userPrompt = `Meeting Notes:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.2);
    aiCache.set(cacheKey, result);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ msg: 'Action item extraction failed', details: error.message });
  }
});

// @route   POST api/ai/flashcards
router.post('/flashcards', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content provided' });

  try {
    const cacheKey = getCacheKey('flashcards', content);
    const cached = aiCache.get(cacheKey);
    if (cached) return res.json({ flashcards: JSON.parse(cached), cached: true });

    const systemPrompt = "Act as an expert tutor. Create 3 to 5 study flashcards based on the provided text. Return the output as a strict JSON array of objects, where each object has a 'q' property (the question) and an 'a' property (the answer). Do not wrap the JSON in markdown codeblocks (like ```json). Return ONLY the raw JSON array.";
    const userPrompt = `Text to convert into flashcards:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.4);
    const cleanedJsonString = result.replace(/```json/g, '').replace(/```/g, '').trim();
    const flashcards = JSON.parse(cleanedJsonString);
    aiCache.set(cacheKey, JSON.stringify(flashcards));
    res.json({ flashcards });
  } catch (error) {
    console.error('Flashcard Error:', error);
    res.status(500).json({ msg: 'Flashcard generation failed', details: error.message });
  }
});

// @route   POST api/ai/quiz
router.post('/quiz', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content provided' });

  try {
    const cacheKey = getCacheKey('quiz', content);
    const cached = aiCache.get(cacheKey);
    if (cached) return res.json({ quiz: JSON.parse(cached), cached: true });

    const systemPrompt = "Act as an expert instructor. Create a 3-5 question multiple choice quiz based on the provided text. Return as a strict JSON array. Each object: 'q' (question), 'options' (4 strings), 'answer' (0-3 index). No markdown wrapping.";
    const userPrompt = `Text to generate a quiz from:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.4);
    const cleanedJsonString = result.replace(/```json/g, '').replace(/```/g, '').trim();
    const quiz = JSON.parse(cleanedJsonString);
    aiCache.set(cacheKey, JSON.stringify(quiz));
    res.json({ quiz });
  } catch (error) {
    res.status(500).json({ msg: 'Quiz generation failed', details: error.message });
  }
});

// @route   POST api/ai/mindmap
router.post('/mindmap', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content provided' });

  try {
    const cacheKey = getCacheKey('mindmap', content);
    const cached = aiCache.get(cacheKey);
    if (cached) return res.json({ mermaid: cached, cached: true });

    const systemPrompt = "Create a Mermaid.js 'mindmap' syntax diagram summarizing core concepts. Start output strictly with 'mindmap'. No markdown blocks. Only alphanumeric node names.\nExample:\nmindmap\n  RootNode\n    Child1\n      Grandchild\n    Child2";
    const userPrompt = `Text to summarize into a mindmap:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.4);
    let mermaid = result.replace(/```mermaid/gi, '').replace(/```/g, '').trim();
    if(!mermaid.toLowerCase().startsWith('mindmap')) {
       if (!mermaid.toLowerCase().includes('graph') && !mermaid.toLowerCase().includes('flowchart')) {
           mermaid = 'mindmap\n  Root\n    Parse Error';
       }
    }
    aiCache.set(cacheKey, mermaid);
    res.json({ mermaid });
  } catch (error) {
    res.status(500).json({ msg: 'Mindmap generation failed', details: error.message });
  }
});

module.exports = router;
