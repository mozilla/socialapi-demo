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
  var user = req.session.user;

  if (!user) {
    debugLog("/events connection rejected (unauthorized)");
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
      channelWrite(res, "ping", "ping", true);
  }, 1000);

  var key = req.connection.remoteAddress + ":" + req.connection.remotePort;
  debugLog("Adding " + user + ", connected from " + key);

  // Auto logout on disconnect.
  req.on("close", function() {
    clearInterval(pinger);
    delete users[key];
    logout(req);
  });

  // First copy the list of existing users.
  var keys = Object.keys(users);

  // Add the current user to the list of online users.
  users[key] = {id: user, response: res};

  for (var i = 0; i < keys.length; i++) {
    var userName = users[keys[i]].id;
    if (userName != req.session.user) {
      channelWrite(res, "userjoined", userName);
      channelWrite(users[keys[i]].response, "userjoined", user);
    }
  }

  debugLog("There are now now " + Object.keys(users).length + " online users");
});

// XXX Need to handle multiple log-in sessions correctly
// XXX Need to handle no-call sessions
function findResponseChannelForUser(aUser) {
  var keys = Object.keys(users);
  var channel;
  for (var i = 0; i < keys.length; i++) {
    if (users[keys[i]].id == aUser) {
      return users[keys[i]].response;
    }
  }
  return "";
}

app.post("/call", function(req, res) {
  if (!req.session.user) {
    res.send(401, "Unauthorized, access denied");
    return;
  }

  var channel = findResponseChannelForUser(req.session.user);
  if (!channel) {
    res.send(400, "User not logged in for making calls");
    return;
  }

  channelWrite(channel, "call", JSON.stringify(req.body));
  res.send(200);
});

app.post("/login", function(req, res) {
  if (req.session.user) {
    debugLog("User session for " + req.session.user + " already created!");
    res.send(200, req.session.user);
    return;
  }
  if (!req.body.assertion) {
    res.send(500, "Invalid login request");
    return;
  }

  if (req.body.fake) {
    finishLogin(req.body.assertion);
  } else {
    verifyAssertion(req.body.assertion, audience, function(val) {
      if (val) {
        finishLogin(val);
      } else {
        res.send(401, "Invalid Persona assertion");
      }
    });
  }

  function finishLogin(user) {
    req.session.regenerate(function() {
      debugLog("Creating user session for " + user);
      req.session.user = user;
      res.send(200, user);
    });
  }
});

// res has a value if the client sent a /logout request and expects a reply,
// and is undefined if the connection has been closed by the client.
function logout(req, res) {
  if (!req.session.user) {
    debugLog(JSON.stringify(req.session) + " " + req.session.user);
    if (res) {
      debugLog("Denying logout");
      res.send(401, "No user currently logged in");
    }
    return;
  }

  var user = req.session.user;
  // Only destroy the session if this is the last channel for the user
  // XXX This will fail if the user logs in via two different clients. We need to store
  // the session id or information in the user data as well. Or key by user, session and port.
  if (!findResponseChannelForUser(user)) {
    req.session.destroy(function() {
      debugLog("Logging out " + user);

      // XXX Do we need this if events does it for us.
      //    delete users[user];
      var keys = Object.keys(users);
      for (var i = 0; i < keys.length; ++i)
        channelWrite(users[keys[i]].response, "userleft", user);

      if (res) {
        res.send(200);
      }
    });
  } else if (res) {
    res.send(200);
  }
}

app.post("/logout", logout);

app.post("/offer", function(req, res) {
  processRequest(req, res, "offer");
});

app.post("/answer", function(req, res) {
  processRequest(req, res, "answer");
});

app.post("/stopcall", function(req, res) {
  processRequest(req, res, "stopcall");
});

app.listen(port, function() {
  debugLog("Port is " + port + " with audience " + audience);
});

// Helper functions.

function processRequest(req, res, type) {
  if (!req.session.user) {
    debugLog("Unathorized request for " + type);
    res.send(401, "Unauthorized, " + type + " access denied");
    return;
  }

  if (!req.body.to || (!req.body.request && type != "stopcall")) {
    res.send(400, "Invalid " + type + " request");
    return;
  }

  var channel = findResponseChannelForUser(req.body.to);
  if (!channel) {
    res.send(400, "Invalid user for " + type);
    return;
  }

  req.body.from = req.session.user;
  channelWrite(channel, type, JSON.stringify(req.body));
  res.send(200);
}

function channelWrite(aChannel, aEventType, aData, aSilent) {
  if (debugLogging && !aSilent) {
    var to = "";
    for (var u in users) {
      if (users[u].response === aChannel) {
        to = users[u].id;
        break;
      }
    }
    debugLog("to: " + to + ", type = " + aEventType + ", data = " + aData);
  }

  aChannel.write("event: " + aEventType + "\ndata: " + aData + "\n\n");
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
