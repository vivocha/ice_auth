#!/usr/bin/node

var fs = require('fs')
  , http = require('http')
  , https = require('https')
  , crypto = require('crypto')
  , mongo = require('mongodb')
  , express = require('express')
  , bodyParser = require('body-parser')
  , app = express()
  , cfg = {
    mongoURI: 'mongodb://localhost:27017/turn?replicaSet=ice&readPreference=nearest',
    keyPath: '/etc/turn/vivocha.com.key',
    certPath: '/etc/turn/vivocha.com.crt',
    realm: 'vivocha'
  }
  
mongo.MongoClient.connect(cfg.mongoURI, function(err, db) {
  if (err) {
    console.error('Failed to connect to MongoDB');
    process.exit(1);
  } else if (!db) {
    console.error('Failed to get a MongoDB handle');
    process.exit(2);
  } else {
    var credentials = {
      key: fs.readFileSync(cfg.keyPath, 'utf8'),
      cert: fs.readFileSync(cfg.certPath, 'utf8')
    };
    var httpServer = http.createServer(app);
    var httpsServer = https.createServer(credentials, app);

    app.use(bodyParser.json());
    app.post('/auth', function(req, res) {
      if (!req.body || !req.body.uid || !req.body.pwd) {
        res.send(400, { success: false, error: 'bad_request' });
      } else {
        var k = crypto.createHash('md5').update(req.body.uid + ':' + cfg.realm + ':' + req.body.pwd).digest('hex');
        db.collection('turnusers_lt').update({
          name: req.body.uid,
          realm: cfg.realm
        }, {
          $set: {
            hmackey: k,
            ts: new Date()
          }
        }, { upsert: true, w: 'majority' }, function(err) {
          if (err) {
            console.error('upsert failed', err);
            res.send(500, { success: false, error: 'failed' });
          } else {
            res.send(200, { success: true, key: k });
          }
        });
      }
    });
    app.delete('/auth/:uid', function(req, res) {
      db.collection('turnusers_lt').remove({
        name: req.params.uid,
        realm: cfg.realm
      }, function(err) {
        if (err) {
          console.error('remove failed', err);
          res.send(500, { success: false, error: 'failed' });
        } else {
          res.send(200, { success: true });
        }
      });
    });
    
    httpServer.listen(6545);
    httpsServer.listen(6546);
  }
});
