/* import a helper library */
// This keeps a list of all the ports that have connected to us
var apiPort;

function log(msg) {
  dump(new Date().toISOString() + ": [dssworker] " + msg + "\n");
  try {
    console.log(new Date().toISOString() + ": [dssworker] " + msg);
  } catch (e) {}
}

var _broadcastReceivers = [];
function broadcast(topic, payload)
{
  // we need to broadcast to all ports connected to this shared worker
  for (var i = 0; i < _broadcastReceivers.length; i++) {
    //log("about to broadcast to " + _broadcastReceivers[i] + "\n");
    _broadcastReceivers[i].postMessage({topic: topic, data: payload});
  }
}

// Called when the worker connects a message port
onconnect = function(e) {
  try {
    var port = e.ports[0];
    port.onmessage = function(e) {
      //log("worker onmessage: " + JSON.stringify(e.data));

      var msg = e.data;
      if (!msg) {
        log("onmessage called with no data");
        return;
      }
      // handle the special message that tells us a port is closing.
      if (msg.topic && msg.topic == "social.port-closing") {
        var index = _broadcastReceivers.indexOf(port);
        if (index != -1) {
          log("removed receiver " + index);
          _broadcastReceivers.splice(index, 1);
        }
        log("bwmworker port closed - now " + _broadcastReceivers.length + " connections.");
        return;
      }

      if (msg.topic && handlers[msg.topic])
        handlers[msg.topic](port, msg);
      else {
        log("message topic not handled: "+msg.topic+" "+JSON.stringify(msg));
        // forward to the api
        try {
          apiPort.postMessage(msg);
        } catch(e) {
          log(e+"\n");
        }
      }
    };
    port.postMessage({topic: "worker.connected"});


  } catch (e) {
    log(e);
  }
}

var userData = {};
// Messages from the sidebar and chat windows:
var handlers = {
  'worker.connected': function(port, msg) {
    log("worker.connected");
  },
  'worker.reload': function(port, msg) {
    broadcast(msg.topic, msg.data);
    userData = {};
    apiPort.postMessage({topic: "social.user-profile", data: userData});
    broadcast('social.user-profile', userData);
    apiPort.postMessage({topic: 'social.reload-worker'});
  },
  'social.initialize': function(port, data) {
    log("social.initialize called, capturing apiPort");
    apiPort = port;
  },
  'broadcast.listen': function(port, data) {
    if (data)
      _broadcastReceivers.push(port);
    else {
      var i = _broadcastReceivers.indexOf(port);
      if (i != -1)
        _broadcastReceivers.splice(i, 1);
    }
  },

  'social.user-recommend-prompt': function(port, msg) {},
  'social.cookies-get-response': function(port, msg) {
    try {
    let cookies = msg.data;
    let newUserData;
    for (var i=0; i < cookies.length; i++) {
      if (cookies[i].name == "userdata") {
        newUserData = cookies[i].value ? JSON.parse(cookies[i].value) : {};
        break;
      }
    }
    if (!newUserData) {
      // Logging out is handled by worker.reload above.
      return;
    }
    if (userData.userName != newUserData.userName) {
      userData = newUserData;
      port.postMessage({topic: "social.user-profile", data: userData});
      broadcast('social.user-profile', userData);
    }
    } catch(e) {
      dump(e.stack+"\n");
    }
  }
}

// lets watch for cookie updates here, polling kinda sucks
function checkCookies() {
  apiPort.postMessage({topic: 'social.cookies-get'});
}
setInterval(checkCookies, 1000);
