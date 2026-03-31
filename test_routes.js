const express = require('express');
const app = express();
const shareRoutes = require('./server/routes/share');
app.use('/api/share', shareRoutes);

app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log(r.route.path);
  } else if (r.name === 'router') {
    console.log('Router at:', r.regexp);
    r.handle.stack.forEach(function(s){
      if (s.route) console.log('  Route:', Object.keys(s.route.methods), s.route.path);
    });
  }
});
