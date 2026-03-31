# Mnemos - Cloud Sync Note Taking App 📝

A beautiful, secure, and performant note-taking application with cloud synchronization. Built with vanilla JavaScript, Express, and MongoDB.

## ✨ Features

### Core Features
- ✅ **Rich Text Editing** - Format notes with bold, italic, headings, lists, and more
- ✅ **Cloud Sync** - Seamless sync across devices with MongoDB backend
- ✅ **Folder Organization** - Organize notes into custom folders
- ✅ **Smart Tagging** - Add tags for quick filtering and discovery
- ✅ **Search** - Full-text search across all notes
- ✅ **Offline Support** - Works offline, syncs when back online
- ✅ **Dark & Light Themes** - Toggle between themes anytime
- ✅ **Keyboard Shortcuts** - Press Ctrl+/ to see all shortcuts

### Advanced Features
- 🎯 **Soft Deletes / Trash** - Recover deleted notes within 30 days
- 🔄 **Auto-Save** - Notes save automatically as you type
- 📌 **Pin Notes** - Pin important notes to the top
- 🎨 **Auto Color Tags** - Tags get unique colors automatically
- 📊 **Note Statistics** - Word count, character count, reading time
- 🔐 **Secure Authentication** - JWT-based auth with bcrypt hashing
- 🛡️ **Input Validation** - Server-side validation for all inputs
- ⚡ **Performance Optimized** - Database indexes, lazy loading, smooth rendering

### Security Features
- ✅ **CORS Whitelist** - Configurable origin restrictions
- ✅ **Rate Limiting** - Protect auth endpoints from brute force
- ✅ **HTML Sanitization** - Prevent XSS with DOMPurify
- ✅ **Password Strength** - Require strong passwords (8+ chars, mixed case)
- ✅ **Error Recovery** - Auto-retry with exponential backoff

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn
- MongoDB Atlas account (or local MongoDB)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/mnemos.git
cd mnemos
```

2. **Install dependencies**
```bash
# Frontend dependencies
npm install

# Backend dependencies
cd server
npm install
cd ..
```

3. **Configure environment**
```bash
# Create server/.env
cat > server/.env << EOF
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/mnemos
JWT_SECRET=your-super-secret-jwt-key-change-this
PORT=5050
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
NODE_ENV=development
EOF
```

4. **Start the server**
```bash
cd server
npm start
```

5. **Start the frontend** (in another terminal)
```bash
# Option 1: Serve with Python
python -m http.server 3000

# Option 2: Serve with Node
npx http-server -p 3000

# Option 3: Use any static server
```

6. **Open in browser**
```
http://localhost:3000
```

---

## 📋 Project Structure

```
mnemos/
├── js/                          # Frontend JavaScript
│   ├── app.js                  # Main app entry point
│   ├── store.js                # Notes & folders CRUD
│   ├── editor.js               # Rich text editor
│   ├── sidebar.js              # Folder & tag management
│   ├── notelist.js             # Note list rendering
│   ├── auth.js                 # Authentication flow
│   ├── search.js               # Search functionality
│   ├── error-handler.js        # Network retry logic
│   ├── renderer.js             # Smooth DOM updates
│   └── ...
├── css/                         # Stylesheets
│   ├── variables.css           # CSS custom properties
│   ├── layout.css              # Layout & grid
│   ├── animations.css          # Keyframes & transitions
│   └── ...
├── server/                      # Backend Express server
│   ├── server.js               # Main server file
│   ├── routes/
│   │   ├── auth.js             # Authentication routes
│   │   └── sync.js             # Notes sync & trash routes
│   ├── models/
│   │   ├── User.js             # User schema
│   │   ├── Note.js             # Note schema
│   │   └── Folder.js           # Folder schema
│   ├── middleware/
│   │   └── auth.js             # JWT verification
│   ├── utils/
│   │   ├── validation.js       # Input validation
│   │   ├── logger.js           # Structured logging
│   │   └── cache.js            # In-memory cache
│   └── package.json
├── index.html                   # Main HTML file
├── API.md                       # API documentation
└── README.md                    # This file
```

---

## 🔧 Configuration

### Environment Variables

**Server (.env)**
```env
# Required
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/mnemos
JWT_SECRET=your-secret-key-min-32-chars-please

# Optional
PORT=5050                                    # Default: 5050
NODE_ENV=development                         # development or production
CORS_ORIGINS=http://localhost:3000          # Comma-separated allowed origins
```

### API Base URL

The frontend will try to connect to `http://localhost:5050/api` by default.

To change this, edit `js/auth.js` line 6:
```javascript
window.API_BASE_URL = 'http://your-server:5050/api';
```

---

##API Reference

See [API.md](./API.md) for complete API documentation including:
- Authentication endpoints
- Note sync endpoints
- Trash/recovery endpoints
- Error handling guide
- Request/response examples

---

## 🧪 Development

### Running Tests
```bash
cd server
npm test
```

### Build for Production
```bash
# Frontend - minify CSS/JS (optional, not required for vanilla)
npm run build

# Backend
cd server
npm run build
```

### Enable Debug Logging
```bash
NODE_ENV=development node server.js
```

---

## 📊 Performance Optimizations

1. **Database Indexes** - Composite indexes on userId, updatedAt, tags
2. **Lazy Loading** - Pagination support (50 notes per page)
3. **Smooth Rendering** - Diff-based DOM updates, no full re-renders
4. **Debounced Sync** - 2-second debounce on note changes
5. **Event Delegation** - Survives re-renders without re-binding
6. **Exponential Backoff** - Smart network retry with 1s, 2s, 5s delays

---

## 🔐 Security Considerations

1. **HTTPS Only** - Always use HTTPS in production
2. **CORS Whitelist** - Set `CORS_ORIGINS` to trusted domains only
3. **JWT Secret** - Use a strong, random secret (min 32 chars)
4. **Rate Limiting** - Auth endpoints limited to 5/15min per IP
5. **Input Validation** - All inputs validated server-side
6. **Password Hashing** - bcrypt with salt rounds = 10
7. **XSS Protection** - HTML sanitized with DOMPurify

---

## 📈 Monitoring & Logging

The application logs all API requests in JSON format:

```bash
# View server logs
tail -f server/logs/combined.log | jq .

# View errors only
tail -f server/logs/error.log | jq .
```

Check server health:
```bash
curl http://localhost:5050/health
```

---

## 🚢 Deployment

### Heroku
```bash
heroku create mnemos-app
git push heroku main
```

### Docker
```bash
docker build -t mnemos .
docker run -p 5050:5050 -e MONGO_URI=... mnemos
```

### AWS/DigitalOcean
1. Deploy backend to compute instance
2. Set environment variables
3. Serve frontend from CDN or static server
4. Use MongoDB Atlas for database

---

## 📱 Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🐛 Known Issues

1. **Large notes** - Notes >10MB may have performance issues
2. **Concurrent editing** - Conflicts resolved by server timestamp (not collaborative)
3. **Mobile keyboard** - May dismiss while editing

---

## 🗺️ Roadmap

### v1.1 (Next)
- [ ] Note versioning / undo-redo
- [ ] Image upload to cloud storage
- [ ] Note sharing with expiring links
- [ ] Bulk operations (delete, move, tag multiple)
- [ ] Export to PDF/Markdown

### v1.2 (Future)
- [ ] Real-time collaborative editing
- [ ] Mobile app (React Native)
- [ ] Desktop app (Electron)
- [ ] Browser extension
- [ ] API for third-party integrations

---

## 💬 Support

- 📧 Email: support@mnemos.app
- 🐛 Bugs: [GitHub Issues](https://github.com/yourusername/mnemos/issues)
- 💡 Feature requests: [GitHub Discussions](https://github.com/yourusername/mnemos/discussions)

---

## ⭐ Give us a star!

If you like Mnemos, please give us a star on GitHub! It helps other people discover the project.

---

**Made with ❤️ by the Mnemos team**
