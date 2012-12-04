var express = require("express"),
    https   = require("https"),
    sys     = require("sys"),
    app     = express();

var debugLogging = true;
function debugLog(str) {
  if (debugLogging) {
    sys.debug(str);
  }
}

app.use(express.bodyParser());
app.use(express.cookieParser("thisistehsecret"));

app.use(express.session());
app.use(express.static(__dirname + "/static"));

var users = {};
var port = process.env.VMC_APP_PORT || process.env.PORT || 5000;
var audience;
if (process.env.AUDIENCE)
  audience = process.env.AUDIENCE;
else if (process.env.VMC_APP_NAME)
  audience = "https://" + process.env.VMC_APP_NAME + ".vcap.mozillalabs.com";
else
  audience = "http://webrtc-social.herokuapp.com";

// We use EventSource for presence. The events are named "userjoined"
// and "userleft".

app.get("/events", function(req, res) {
  debugLog("/events connection opened");
  if (!req.session.user) {
    res.send(401, "Unauthorized, events access denied");
    return;
  }

  // Setup event channel.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache"
  });

  // Ping every 1 second.
  var pinger = setInterval(function() {
    if (res)
      channelWrite(res, "ping", "ping");
  }, 1000);

  // Auto logout on disconnect.
  req.on("close", function() {
    clearInterval(pinger);
    logout(req);
  });

  // First notify this user of all users current.
  var keys = Object.keys(users);
  debugLog("number of known users: " + keys.length);
  for (var i = 0; i < keys.length; i++) {
    var user = keys[i];
    debugLog("about to send userjoined event, data: " + user);
    channelWrite(res, "userjoined", user);
  }

  // Add to current list of online users.
  var user = req.session.user;
  notifyAllAbout(user, "userjoined");
  users[user] = res;
  debugLog("added " + user + " to users, # known now: " +
           Object.keys(users).length);
});

app.post("/call", function(req, res) {
  if (!req.body.assertion) {
    res.send(500, "Invalid login request");
    return;
  }

  verifyAssertion(req.body.assertion, audience, function(val) {
    if (val) {
      // XXX de-dupe with processRequest?
      var channel = users[val];
      if (!channel) {
        res.send(400, "User not logged in for making calls");
        return;
      }

      channelWrite(channel, "call", JSON.stringify(req.body));
      res.send(200);
    } else {
      res.send(401, "Invalid Persona assertion");
    }
  });
});

app.post("/login", function(req, res) {
  if (!req.body.assertion) {
    res.send(500, "Invalid login request");
    return;
  }

  if (req.body.fake) {
    finishLogin(req.body.assertion);
  } else {
    verifyAssertion(req.body.assertion, audience, function(val) {
      var noshow = req.body.noshow;
      if (val) {
        if (noshow) {
          debugLog("User " + val + " logged in, but noshow specified");
          res.send(200, val);
          return;
        }
        finishLogin(val);
      } else {
        res.send(401, "Invalid Persona assertion");
      }
    });
  }

  function finishLogin(user) {
    req.session.regenerate(function() {
      req.session.user = user;
      res.send(200, user);
    });
  }
});

// res has a value if the client sent a /logout request and expects a reply,
// and is undefined if the connection has been closed by the client.
function logout(req, res) {
  if (!req.session.user) {
    if (res)
      res.send(401, "No user currently logged in");
    return;
  }

  var user = req.session.user;
  req.session.destroy(function() {
    delete users[user];
    notifyAllAbout(user, "userleft");
    if (res) {
      res.send(200);
    }
  });
}

app.post("/logout", logout);

app.post("/offer", function(req, res) {
  processRequest(req, res, "offer");
});

app.post("/answer", function(req, res) {
  processRequest(req, res, "answer");
});

app.listen(port, function() {
  debugLog("Port is " + port + " with audience " + audience);
});

// Helper functions.

function processRequest(req, res, type) {
  if (!req.session.user) {
    res.send(401, "Unauthorized, " + type + " access denied");
    return;
  }

  if (!req.body.to || !req.body.from || !req.body.request) {
    res.send(400, "Invalid " + type + " request");
    return;
  }

  var channel = users[req.body.to];
  if (!channel) {
    res.send(400, "Invalid user for " + type);
    return;
  }

  channelWrite(channel, type, JSON.stringify(req.body));
  res.send(200);
}

function channelWrite(aChannel, aEventType, aData) {
  aChannel.write("event: " + aEventType + "\ndata: " + aData + "\n\n");
}

function notifyAllAbout(user, type) {
  var keys = Object.keys(users);
  for (var i = 0; i < keys.length; i++) {
    debugLog("about to channel write in notifyAllAbout; event type: " + type + ", data: " + user);
    channelWrite(users[keys[i]], type, user);
  }
}

function verifyAssertion(ast, aud, cb) {
  var data = "audience=" + encodeURIComponent(aud);
  data += "&assertion=" + encodeURIComponent(ast);

  var options = {
    host: "verifier.login.persona.org",
    path: "/verify",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": data.length
    }
  };

  var req = https.request(options, function(res) {
    var ret = "";
    res.on("data", function(chunk) {
      ret += chunk;
    });
    res.on("end", function() {
      try {
        var val = JSON.parse(ret);
      } catch(e) {
        cb(false);
        return;
      }
      if (val.status == "okay") {
        cb(val.email);
      } else {
        debugLog(data);
        debugLog(val);
        cb(false);
      }
    });
  });

  req.write(data);
  req.end();
}
