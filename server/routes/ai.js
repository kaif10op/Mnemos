const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const NodeCache = require('node-cache');
const crypto = require('crypto');

// Setup response cache (5 minute TTL)
const aiCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Setup Rate Limiting for AI endpoints (10 requests per minute)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
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
    model: 'llama3-8b-8192', // Fast, good for general tasks
    format: 'openai'
  },
  {
    name: 'Cerebras',
    apiKey: process.env.CEREBRAS_API_KEY,
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama3.1-8b', // Ultra fast fallback
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

// Helper to filter out missing keys
const getAvailableProviders = () => {
  return PROVIDERS.filter(p => !!p.apiKey);
};

// Unified LLM call function with Fallback strategy
async function askAI(systemPrompt, userPrompt, temperature = 0.5) {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    throw new Error('No AI providers configured in the environment.');
  }

  const errors = [];

  for (const provider of providers) {
    try {
      console.log(`[AI] Attempting request using ${provider.name}...`);
      
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
            temperature: temperature,
            max_tokens: 1500
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
            generationConfig: { temperature: temperature, maxOutputTokens: 1500 }
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        responseText = data.candidates && data.candidates[0] && data.candidates[0].content.parts[0].text;
      }

      if (!responseText) {
        throw new Error('Empty response from provider API');
      }

      console.log(`[AI] Success with ${provider.name}`);
      return responseText.trim();

    } catch (err) {
      console.error(`[AI] Provider ${provider.name} failed:`, err.message);
      errors.push(`${provider.name}: ${err.message}`);
      // Continue to next provider in loop
    }
  }

  // If all failed
  throw new Error(`All AI providers failed. Errors: ${errors.join(' | ')}`);
}

// Generates a predictable cache key
function getCacheKey(type, content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `ai_${type}_${hash}`;
}

// @route   POST api/ai/complete
// @desc    General continuation / rewrite tasks
// @access  Private
router.post('/complete', auth, aiLimiter, async (req, res) => {
  const { prompt, context, taskId } = req.body;
  
  if (!prompt && !context) {
    return res.status(400).json({ msg: 'Missing prompt or context' });
  }

  try {
    const systemPrompt = "You are Mnemos AI, an intelligent assistant built into a note-taking application. Respond concisely and effectively.";
    const userPrompt = context ? `Context from my notes:\n"${context}"\n\nTask:\n${prompt}` : prompt;
    
    // Quick cache check
    const cacheKey = getCacheKey('complete', userPrompt);
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) {
      return res.json({ result: cachedResponse, cached: true });
    }

    const result = await askAI(systemPrompt, userPrompt, 0.7);
    aiCache.set(cacheKey, result);
    
    res.json({ result, cached: false });
  } catch (error) {
    console.error('[AI /complete] Error:', error);
    res.status(500).json({ msg: 'AI processing failed', details: error.message });
  }
});

// @route   POST api/ai/agent
// @desc    Determine the action intent and perform the task
// @access  Private
router.post('/agent', auth, aiLimiter, async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ msg: 'Missing prompt' });

  try {
    const systemPrompt = `You are an Agentic Editor Assistant. Your job is to understand what the user wants to do with their workspace or currently open document. You must return a strict JSON object with properties: "action" (string), "text" (string), "title" (string, optional), and "tags" (string, optional). DO NOT wrap the output in markdown block ticks like \`\`\`json. 

Available actions:
1. "REPLACE_ALL": Rewrite or format the entire text in the context. "text" is the FULL modified document.
2. "APPEND_BOTTOM": Add something to the bottom of the document. "text" is ONLY the text to append.
3. "INSERT_TOP": Add something to the top of the document. "text" is ONLY the text to prepend.
4. "CREATE_NOTE": The user wants you to create a brand new note based on their prompt. "text" is the newly generated note content, "title" is the note title.
5. "UPDATE_TITLE": The user wants to rename the current note. "title" is the new name.
6. "ADD_TAG": The user wants to add tags to the current note. "tags" is a comma separated list of tags (e.g. "urgent, marketing").
7. "CHAT": The user is just asking a question. "text" is your conversational response.

Return ONLY valid, parseable JSON.`;

    const userPrompt = context ? `Current Document Content:\n"${context}"\n\nUser Request:\n${prompt}` : `User Request: ${prompt}\n\n(No document context provided)`;
    
    // Bypass cache for agentic stuff, since it can mutate wildly based on context.
    const result = await askAI(systemPrompt, userPrompt, 0.2);
    
    const cleanedJsonString = result.replace(/```json/gi, '').replace(/```/g, '').trim();
    let payload;
    try {
      payload = JSON.parse(cleanedJsonString);
    } catch(err) {
      // IF regex failed to parse json properly, fallback to CHAT output
      payload = { action: 'CHAT', text: result };
    }
    
    if(!['REPLACE_ALL', 'APPEND_BOTTOM', 'INSERT_TOP', 'CREATE_NOTE', 'UPDATE_TITLE', 'ADD_TAG', 'CHAT'].includes(payload.action)) {
       payload.action = 'CHAT'; 
    }

    res.json({ agent: payload });
  } catch (error) {
    console.error('[AI /agent] Error:', error);
    res.status(500).json({ msg: 'Agent processing failed', details: error.message });
  }
});

// @route   POST api/ai/summarize
// @desc    Summarize a note
// @access  Private
router.post('/summarize', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  
  if (!content) return res.status(400).json({ msg: 'No content to summarize' });

  try {
    const cacheKey = getCacheKey('summarize', content);
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) return res.json({ result: cachedResponse, cached: true });

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
// @desc    Auto-tag generation
// @access  Private
router.post('/tags', auth, aiLimiter, async (req, res) => {
  const { content, existingTags } = req.body;
  
  if (!content) return res.status(400).json({ msg: 'No content to tag' });

  try {
    const cacheKey = getCacheKey('tags', content);
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) return res.json({ tags: JSON.parse(cachedResponse), cached: true });

    const systemPrompt = "Analyze the text and provide exactly 3-5 relevant, short tags. Try to reuse provided existing tags if highly relevant, but feel free to suggest new ones. Return the output as a clean, comma-separated list of words with no # symbols, no bullet points, and no extra text.";
    const userPrompt = `Existing tags in user's workspace: ${existingTags ? existingTags.join(', ') : 'none'}\n\nContent to tag:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.3);
    
    // Parse result into array
    const tags = result.split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0 && t.length < 20); // Sanity bounds

    aiCache.set(cacheKey, JSON.stringify(tags));
    
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ msg: 'Tagging failed', details: error.message });
  }
});

// @route   POST api/ai/actions
// @desc    Extract Action Items from Meeting Notes
// @access  Private
router.post('/actions', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content to analyze' });

  try {
    const cacheKey = getCacheKey('actions', content);
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) return res.json({ result: cachedResponse, cached: true });

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
// @desc    Generate Q&A Flashcards
// @access  Private
router.post('/flashcards', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content provided' });

  try {
    const cacheKey = getCacheKey('flashcards', content);
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) return res.json({ flashcards: JSON.parse(cachedResponse), cached: true });

    const systemPrompt = "Act as an expert tutor. Create 3 to 5 study flashcards based on the provided text. Return the output as a strict JSON array of objects, where each object has a 'q' property (the question) and an 'a' property (the answer). Do not wrap the JSON in markdown codeblocks (like ```json). Return ONLY the raw JSON array.";
    const userPrompt = `Text to convert into flashcards:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.4);
    
    // Clean string incase of markdown wrapping
    const cleanedJsonString = result.replace(/```json/g, '').replace(/```/g, '').trim();
    const flashcards = JSON.parse(cleanedJsonString);

    aiCache.set(cacheKey, JSON.stringify(flashcards));
    
    res.json({ flashcards });
  } catch (error) {
    console.error('Flashcard Error parsing:', error);
    res.status(500).json({ msg: 'Flashcard generation failed', details: error.message });
  }
});

// @route   POST api/ai/quiz
// @desc    Generate a multiple choice quiz
// @access  Private
router.post('/quiz', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content provided' });

  try {
    const cacheKey = getCacheKey('quiz', content);
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) return res.json({ quiz: JSON.parse(cachedResponse), cached: true });

    const systemPrompt = "Act as an expert instructor. Create a 3-5 question multiple choice quiz based on the provided text to test the user's comprehension. Return the output as a strict JSON array of objects. Each object must have a 'q' property (the question), an 'options' property (a length 4 array of strings), and an 'answer' property (an integer 0-3 representing the correct option). Do not wrap the JSON in markdown codeblocks (like ```json). Return ONLY the raw JSON array.";
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
// @desc    Generate a Mermaid.js Mind map
// @access  Private
router.post('/mindmap', auth, aiLimiter, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ msg: 'No content provided' });

  try {
    const cacheKey = getCacheKey('mindmap', content);
    const cachedResponse = aiCache.get(cacheKey);
    if (cachedResponse) return res.json({ mermaid: cachedResponse, cached: true });

    const systemPrompt = "Act as an expert mindmapper. Create a Mermaid.js 'mindmap' syntax diagram summarizing the core concepts of the text. Start the output strictly with the word 'mindmap'. Do not enclose it in markdown blocks! Only use alphanumeric names for nodes (no parentheses, quotes, or special characters). Example format:\nmindmap\n  RootNode\n    Child1\n      Grandchild\n    Child2";
    const userPrompt = `Text to summarize into a mindmap chart:\n\n${content}`;

    const result = await askAI(systemPrompt, userPrompt, 0.4);
    
    let mermaid = result.replace(/```mermaid/gi, '').replace(/```/g, '').trim();
    if(!mermaid.toLowerCase().startsWith('mindmap')) {
       // if it generated a flowchart by accident, lets hope it works. If not, fallback
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
