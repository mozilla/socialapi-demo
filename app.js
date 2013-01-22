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
      res.write(":ping\n\n");
  }, 20000);

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
  users[key] = {id: user, response: res, sessionID: req.sessionID,
                source: req.query["source"]};

  for (var i = 0; i < keys.length; i++) {
    var userName = users[keys[i]].id;
    if (userName != req.session.user) {
      channelWrite(res, "userjoined", userName);
      channelWrite(users[keys[i]].response, "userjoined", user);
    }
  }

  debugLog("There are now now " + Object.keys(users).length + " online users");
});

function findConnectionsForUser(aUser) {
  return Object.keys(users)
               .map(function(k) { return users[k]; })
               .filter(function(u) { return u.id == aUser});
}

app.post("/call", function(req, res) {
  if (!req.session.user) {
    res.send(401, "Unauthorized, access denied");
    return;
  }

  var connections = findConnectionsForUser(req.session.user);
  if (!connections.length) {
    res.send(400, "User not logged in for making calls");
    return;
  }

  for (var i = 0; i < connections.length; ++i) {
    if (connections[i].sessionID == req.sessionID &&
        connections[i].source == "sidebar") {
      channelWrite(connections[i].response, "call", JSON.stringify(req.body));
      break;
    }
  }

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
  // Only send the userleft events if this is the last channel for the user.
  if (!findConnectionsForUser(user).length) {
    var keys = Object.keys(users);
    for (var i = 0; i < keys.length; ++i)
      channelWrite(users[keys[i]].response, "userleft", user);
  }

  req.session.destroy(function() {
    debugLog("Logging out " + user);
    if (res)
      res.send(200);
  });
}

app.post("/logout", logout);

app.post("/offer", function(req, res) {
  if (!checkRequest(req, res, "offer"))
    return;

  // Send the offer to all connections of the contact.
  var to = req.body.to;
  var connections = findConnectionsForUser(to);
  if (!connections.length) {
    res.send(400, to + " isn't connected (failed /offer)");
    return;
  }
  req.body.from = req.session.user;
  var data = JSON.stringify(req.body);
  connections.forEach(function(c) { channelWrite(c.response, "offer", data); });

  // Remember which connection of the user has initiated the call.
  var userConnections = findConnectionsForUser(req.session.user);
  for (var i = 0; i < userConnections.length; ++i) {
    if (userConnections[i].sessionID == req.sessionID) {
      userConnections[i].calling = to;
      break;
    }
  }
  res.send(200);
});

app.post("/answer", function(req, res) {
  if (!checkRequest(req, res, "answer"))
    return;

  // Send the answer to the caller.
  var connections = findConnectionsForUser(req.body.to);
  for (var i = 0; i < connections.length; ++i) {
    if (connections[i].calling != req.session.user)
      continue;
    req.body.from = req.session.user;
    channelWrite(connections[i].response, "answer", JSON.stringify(req.body));
    delete connections[i].calling;
    break;
  }

  // Send a stopcall to all the other user connections that received the offer.
  findConnectionsForUser(req.session.user).forEach(function(c) {
    if (c.sessionID != req.sessionID)
      channelWrite(c.response, "stopcall", JSON.stringify({from: req.body.to}));
  });

  res.send(200);
});

app.post("/stopcall", function(req, res) {
  if (!checkRequest(req, res, "stopcall"))
    return;

  req.body.from = req.session.user;
  // Check first if there are connections with pending calls. If there
  // are, send the stopcall message only to these connections (this
  // avoids cancelling an ongoing call if the same user tried to call
  // from another connection point).
  // Otherwise, send the stopcall to all connections, to cancel the active call.
  // We shouldn't send a stopcall to connections that weren't part of
  // the call, but the UI will just ignore them if there's no ongoing
  // call from that person...
  var connections = findConnectionsForUser(req.body.to);
  var callingConnections =
    connections.filter(function(c) { return "calling" in c; });
  if (callingConnections.length)
    connections = callingConnections;

  connections.forEach(function(c) {
    channelWrite(c.response, "stopcall", JSON.stringify(req.body));
    delete c.calling;
  });

  // Send a stopcall to all the other user connections that received the offer.
  findConnectionsForUser(req.session.user).forEach(function(c) {
    if (c.sessionID != req.sessionID)
      channelWrite(c.response, "stopcall", JSON.stringify({from: req.body.to}));
  });

  res.send(200);
});

app.listen(port, function() {
  debugLog("Port is " + port + " with audience " + audience);
});

// Helper functions.

function checkRequest(req, res, type) {
  if (!req.session.user) {
    debugLog("Unathorized request for " + type);
    res.send(401, "Unauthorized, " + type + " access denied");
    return false;
  }

  if (!req.body.to || (!req.body.request && type != "stopcall")) {
    res.send(400, "Invalid " + type + " request");
    return false;
  }

  if (!findConnectionsForUser(req.body.to).length) {
    res.send(400, "Invalid user for " + type);
    return false;
  }

  return true;
}

function channelWrite(aChannel, aEventType, aData) {
  if (debugLogging) {
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
