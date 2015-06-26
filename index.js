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
    mongoURI: 'mongodb://localhost:27017/turn?replicaSet=ice&readPreference=nearest&auto_reconnect=true',
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
    ensureIndexes(db, function (err) {
      if (err) {
        console.error('Failed to ensure indexes');
        process.exit(3);
      }       
    });
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

function ensureIndexes(db, cb) {  
  var turnusers_lt = db.collection("turnusers_lt");
  var turnusers_st = db.collection("turnusers_st");
  var turn_secret = db.collection("turn_secret");
  var realm = db.collection("realm"); 
  turnusers_lt.ensureIndex({ "ts": 1 }, { "expireAfterSeconds": 86400, background: true}, function (err) {
    if (err) { cb(err); return; }
    turnusers_lt.ensureIndex({ "realm": 1, "name": 1 }, {"unique" : true, background: true}, function (err) {
      if (err) { cb(err); return; }
      turnusers_st.ensureIndex({ "name": 1 }, {"unique": true, background: true}, function (err) {
        if (err) { cb(err); return; }
        turn_secret.ensureIndex({ "realm": 1 }, {"unique": true, background: true}, function (err) {
          if (err) { cb(err); return; }
          realm.ensureIndex({ "realm": 1 }, {"unique": true, background: true}, function (err) {
            cb(err);
          });
        });
      });
    });
  });  
}
