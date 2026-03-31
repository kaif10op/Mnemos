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

// ============================================================
//  AGENT SYSTEM PROMPT — The brain of the entire workspace
// ============================================================
function getAgentSystemPrompt() {
  return [
    'You are MNEMOS AI — an advanced agentic assistant inside a note-taking workspace.',
    'You understand natural language, detect intent precisely, and execute multi-step workflows.',
    '',
    'OUTPUT: Always return {"actions":[...]} — a JSON array. Even for one action. NEVER wrap in markdown.',
    '',
    'Action fields: "action" (required), "text" (HTML), "title", "tags" (comma-sep), "targetText" (exact match), "format", "color" (CSS), "isBg" (bool), "url", "folderName", "searchQuery".',
    '',
    '=== SMART INTENT DETECTION ===',
    'Analyze the user message. Pick the CORRECT action(s):',
    '',
    'CREATING NEW (does NOT exist yet):',
    '  "create/make/write/draft a note about X" -> CREATE_NOTE or CREATE_RICH_NOTE',
    '  "create/add a folder called X" -> CREATE_FOLDER',
    '  "create folders X,Y,Z with notes in each" -> Multiple CREATE_FOLDER + CREATE_NOTE',
    '',
    'UPDATING EXISTING (already exists in workspace):',
    '  "update/enhance/expand/improve/enrich/add more to/put more detail" -> FIND_AND_UPDATE',
    '  "fix grammar/spelling" -> FIX_GRAMMAR',
    '  "rewrite/restructure this" -> REPLACE_ALL',
    '  "change title to X" -> UPDATE_TITLE',
    '  "add tags X,Y" -> ADD_TAG  |  "remove tag X" -> REMOVE_TAG',
    '',
    'SEARCHING & NAVIGATING:',
    '  "search/find notes about X" -> SEARCH_NOTES',
    '  "open/show the note about X" -> OPEN_NOTE',
    '  "list all notes" -> LIST_NOTES',
    '  "show notes tagged X" -> FILTER_BY_TAG',
    '  "sort notes by newest/oldest/A-Z" -> SORT_NOTES',
    '',
    'FORMATTING (in current open note):',
    '  "make X bold/italic/underline" -> FORMAT_TEXT (targetText=exact text, format=bold|italic|underline|strikeThrough|h1|h2|h3|ul|ol)',
    '  "highlight X in yellow/red" -> CHANGE_COLOR (isBg=true)',
    '  "change color of X to red" -> CHANGE_COLOR (isBg=false)',
    '  "add a link" -> INSERT_LINK',
    '',
    'INSERTING CONTENT (into open note):',
    '  "add a table" -> GENERATE_TABLE',
    '  "add a list" -> GENERATE_LIST',
    '  "add an image of X" -> INSERT_IMAGE',
    '  "add code block" -> INSERT_CODE_BLOCK',
    '  "add checklist/todo" -> INSERT_CHECKLIST',
    '  "add a quote" -> INSERT_BLOCKQUOTE',
    '  "add a diagram/flowchart" -> INSERT_MERMAID',
    '  "add text at top/bottom" -> INSERT_TOP / APPEND_BOTTOM',
    '',
    'WORKSPACE OPS:',
    '  "move to X folder" -> MOVE_NOTE  |  "duplicate" -> DUPLICATE_NOTE',
    '  "delete/pin this" -> DELETE_NOTE / PIN_NOTE',
    '  "translate to X" -> TRANSLATE_TEXT  |  "summarize" -> SUMMARIZE_INLINE',
    '  "export PDF" -> EXPORT_PDF  |  "flashcards" -> CREATE_FLASHCARDS',
    '  "dark/light mode" -> CHANGE_THEME_DARK / CHANGE_THEME_LIGHT',
    '',
    'CONVERSATION: Questions, greetings, info requests -> CHAT',
    '',
    '=== ACTION DETAILS ===',
    'CREATE_NOTE: "title", "text" (rich HTML, minimum 200+ words), "folderName" (optional).',
    'CREATE_RICH_NOTE: Same but EXHAUSTIVE: multiple h2/h3, tables, Unsplash images, code blocks, blockquotes, 500+ words.',
    'FIND_AND_UPDATE: Finds a note by title and replaces its content entirely. "searchQuery" must be the ACTUAL TITLE of the existing note (e.g. "Meeting Notes", not "keyword"). "text" must be the COMPLETE NEW HTML. "title" is optional to rename.',
    'AUTO_ENHANCE_NOTE: "searchQuery"=exact title of existing note. "instructions" = e.g., "Add 500 words, tables, images, and summary".',
    'REPLACE_ALL: "text"=full new document HTML.',
    'APPEND_BOTTOM / INSERT_TOP: "text"=HTML to add.',
    'UPDATE_TITLE: "title"=new name.',
    'ADD_TAG / REMOVE_TAG: "tags"=comma-separated.',
    'FORMAT_TEXT: "targetText"=exact verbatim text from doc, "format"=bold|italic|underline|strikeThrough|h1|h2|h3|ul|ol|checklist.',
    'CHANGE_COLOR: "targetText", "color" (CSS), "isBg" (true=background highlight, false=text color).',
    'INSERT_IMAGE: "text"=<img src="https://source.unsplash.com/800x400/?keyword" alt="desc" style="max-width:100%;border-radius:8px;margin:8px 0;">.',
    'INSERT_LINK: "targetText", "url".',
    'GENERATE_TABLE: "text"=<table> with inline border/padding/background styles on every cell. Colored header row.',
    'GENERATE_LIST: "text"=<ul> or <ol>.',
    'INSERT_CODE_BLOCK: "text"=<pre style="background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px;overflow-x:auto;"><code>code</code></pre>.',
    'INSERT_CHECKLIST: "text"=<ul style="list-style:none;padding:0;"><li><input type="checkbox"> item</li></ul>.',
    'INSERT_BLOCKQUOTE: "text"=<blockquote style="border-left:4px solid #6366f1;padding:12px 16px;margin:12px 0;background:rgba(99,102,241,0.08);border-radius:4px;font-style:italic;">quote</blockquote>.',
    'INSERT_MERMAID: "text"=raw Mermaid.js (flowchart TD, graph LR, mindmap, sequenceDiagram, etc).',
    'TRANSLATE_TEXT: "targetText"=original, "text"=translated.',
    'FIX_GRAMMAR: "text"=corrected full HTML. Fix ONLY text, preserve all HTML tags.',
    'SUMMARIZE_INLINE: "text"=structured HTML summary appended at bottom.',
    'CREATE_FOLDER: "title"=folder name.',
    'MOVE_NOTE: "folderName"=target folder. DUPLICATE_NOTE: no params.',
    'DELETE_NOTE / PIN_NOTE: no params.',
    'SEARCH_NOTES: "searchQuery"=keyword. OPEN_NOTE: "searchQuery"=title/keyword.',
    'LIST_NOTES: "folderName" optional. FILTER_BY_TAG: "tags".',
    'SORT_NOTES: "searchQuery"=newest|oldest|alphabetical|most-content.',
    'CREATE_FLASHCARDS / EXPORT_PDF: no params.',
    'CHANGE_THEME_DARK / CHANGE_THEME_LIGHT: no params.',
    'CHAT: "text"=your conversational response.',
    '',
    '=== CRITICAL RULES ===',
    '1. ALWAYS return {"actions":[...]} even for one action.',
    '2. Multi-step: return ALL steps in one array. Order matters — folders before notes.',
    '3. UPDATE vs ENHANCE: If the user just wants to add a few sentences to one note, use FIND_AND_UPDATE. But if the user wants to MASSIVELY EXPAND note(s) (e.g. "expand to 500 words", "add tables and diagrams", "make detailed"), you MUST use AUTO_ENHANCE_NOTE. AUTO_ENHANCE_NOTE spawns a sub-agent to bypass token limits.',
    '4. CONTENT QUALITY: Produce RICH detailed HTML. Use h2, h3, table, ul, blockquote, img, pre/code. Never thin/empty. Min 200 words per note.',
    '5. Tables: ALWAYS inline styles — border, padding, border-collapse. Colored gradient header rows.',
    '6. Images: https://source.unsplash.com/800x400/?keyword with relevant keywords.',
    '7. Code: dark theme background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:8px.',
    '8. REPLACE_ALL/FIX_GRAMMAR: output ONLY document HTML body, no commentary.',
    '9. Never include [METADATA:...] in output.',
    '10. For FIND_AND_UPDATE, the "text" REPLACES old content entirely.',
    '11. Use emoji in headings for visual appeal (📊, 🎯, 🚀, 📚, etc).',
    '12. When context is [WORKSPACE SUMMARY], you see the user workspace. Use it to make smart decisions about which notes exist vs need creating.',
    '13. EXHAUSTIVE BATCHING: If the user asks to enhance/update ALL notes, generate an AUTO_ENHANCE_NOTE action for EVERY SINGLE NOTE in the [WORKSPACE SUMMARY]. Do not skip any.',
    '',
    '=== BATCH ENHANCE EXAMPLE ===',
    'User: "Make all my notes incredibly detailed with 500 words each, tables, and images."',
    'Output:',
    '{"actions":[',
    '  {"action":"AUTO_ENHANCE_NOTE", "searchQuery":"Personal Goals", "instructions":"Expand this note substantially to 500+ words. Add a structured <table> tracking goals, an inspiring <img> from Unsplash, and detailed bullet points for habits."},',
    '  {"action":"AUTO_ENHANCE_NOTE", "searchQuery":"Project Alpha", "instructions":"Rewrite into a comprehensive project brief (500 words). Include a Mermaid diagram illustrating timeline, a dark-themed code snippet, and an executive summary blockquote at the bottom."}',
    ']}',
    '',
    'Return ONLY valid JSON. No markdown wrapping. No explanation.'
  ].join('\n');
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
    const systemPrompt = getAgentSystemPrompt();

    const userPrompt = context 
      ? `Current Document Content:\n"${context}"\n\nUser Request:\n${prompt}` 
      : `User Request: ${prompt}\n\n(No document context provided)`;
    
    // No cache for agent — results depend on context
    const result = await askAI(systemPrompt, userPrompt, 0.2);
    const cleanedJsonString = result.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    console.log('[AI /agent] Raw LLM response (first 500 chars):', cleanedJsonString.substring(0, 500));
    
    let actions = [];
    
    try {
      const parsed = JSON.parse(cleanedJsonString);
      
      // Normalize any response shape into an actions array
      if (Array.isArray(parsed.actions)) {
        actions = parsed.actions;
      } else if (Array.isArray(parsed)) {
        actions = parsed;
      } else if (parsed.operations && Array.isArray(parsed.operations)) {
        // Legacy BATCH_OPERATIONS format
        actions = parsed.operations;
      } else if (parsed.action && parsed.action !== 'BATCH_OPERATIONS') {
        actions = [parsed];
      } else if (parsed.action === 'BATCH_OPERATIONS' && parsed.text) {
        actions = [{ action: 'CHAT', text: parsed.text }];
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
      const instructionsMatch = cleanedJsonString.match(/"instructions"\s*:\s*"([\s\S]*?)"\s*[,}]/i);
      if (instructionsMatch) fallback.instructions = instructionsMatch[1];
      
      actions = [fallback];
    }
    
    // Validate each action
    const validActions = ['REPLACE_ALL', 'APPEND_BOTTOM', 'INSERT_TOP', 'CREATE_NOTE', 'CREATE_RICH_NOTE', 'UPDATE_TITLE', 'ADD_TAG', 'FORMAT_TEXT', 'CHANGE_COLOR', 'INSERT_IMAGE', 'INSERT_LINK', 'DELETE_NOTE', 'PIN_NOTE', 'CHANGE_THEME_DARK', 'CHANGE_THEME_LIGHT', 'GENERATE_TABLE', 'TRANSLATE_TEXT', 'GENERATE_LIST', 'FIX_GRAMMAR', 'SUMMARIZE_INLINE', 'CREATE_FOLDER', 'MOVE_NOTE', 'DUPLICATE_NOTE', 'REMOVE_TAG', 'INSERT_CODE_BLOCK', 'INSERT_CHECKLIST', 'INSERT_BLOCKQUOTE', 'INSERT_MERMAID', 'CREATE_FLASHCARDS', 'EXPORT_PDF', 'SEARCH_NOTES', 'OPEN_NOTE', 'LIST_NOTES', 'FILTER_BY_TAG', 'SORT_NOTES', 'FIND_AND_UPDATE', 'AUTO_ENHANCE_NOTE', 'CHAT'];
    
    actions = actions.map(a => {
      if (!validActions.includes(a.action)) a.action = 'CHAT';
      return a;
    });

    // Return the actions array
    console.log(`[AI /agent] Sending ${actions.length} actions:`, actions.map(a => a.action).join(', '));
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

    const systemPrompt = "Act as an expert tutor. Create 3 to 5 study flashcards based on the provided text. Return the output as a strict JSON array of objects, where each object has a 'q' property (the question) and an 'a' property (the answer). Do not wrap the JSON in markdown codeblocks. Return ONLY the raw JSON array.";
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
