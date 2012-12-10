var gContacts = {};
var gChats = {};
var gUsername = "";

function onPersonaLogin(assertion) {
  remoteLogin({assertion: assertion});
}

function onPersonaLogout(assertion) {
  if (gUsername)
    remoteLogout();
}

function onLoad() {
  var worker = navigator.mozSocial.getWorker();
  if (!worker) {
    document.body.style.border = "3px solid red";
  }

  watchPersonaLogins(onPersonaLogin, onPersonaLogout);
}

function onContactClick(aEvent) {
  callPerson(aEvent.target.innerHTML);
}

function callPerson(aPerson) {
  openChat(aPerson, function(aWin) {
    var win = gChats[aPerson].win;
    var pc = new win.mozRTCPeerConnection();
    pc.onaddstream = function(obj) {
      var doc = win.document;
      var type = obj.type;
      if (type == "video") {
        var video = doc.getElementById("remoteVideo");
        video.mozSrcObject = obj.stream;
        video.play();
      } else if (type == "audio") {
        var audio = doc.getElementById("remoteAudio");
        audio.mozSrcObject = obj.stream;
        audio.play();
      } else {
        alert("sender onaddstream of unknown type, obj = " + obj.toSource());
      }
    };
    setupDataChannel(true, pc, aPerson);
    gChats[aPerson].pc = pc;
    getAudioVideo(aWin, pc, function() {
      pc.createOffer(function(offer) {
        pc.setLocalDescription(offer, function() {
          $.ajax({type: 'POST', url: '/offer',
                  data: {to: aPerson, request: JSON.stringify(offer)}});},
          function(err) { alert("setLocalDescription failed: " + err); });
      }, function(err) { alert("createOffer failed: " + err); });
    });
  });
}

function startGuest() {
  $("#signin").hide();
  $("#guest").html(
    '<input type="text" id="user"/>' +
    '<input type="button" value="Login" onclick="javascript:guestLogin();"/>'
  );
}

function guestLogin() {
  var user = $("#user").attr("value");
  remoteLogin({assertion: user, fake: true});
}

function signedIn(aEmail) {
  $("#guest").hide();
  $("#signin").hide();
  var end = location.href.indexOf("/sidebar.htm");
  var baselocation = location.href.substr(0, end);
  var userdata = {
    portrait: baselocation + "/user.png",
    userName: aEmail,
    dispayName: aEmail,
    profileURL: baselocation + "/user.html"
  };
  document.cookie="userdata="+JSON.stringify(userdata);

  gUsername = aEmail;
  gContacts[aEmail] = $("<li>"); // Avoid displaying the user in the contact list.
}

function signedOut() {
  delete gContacts[gUsername];
  gUsername = "";

  reload();
}

var filename = "default.txt";
function setupDataChannel(originator, pc, target) {
  var win = gChats[target].win;

  pc.ondatachannel = function(channel) {
    setupFileSharing(win, channel, target);
  };

  pc.onconnection = function() {
    if (originator) {
      // open a channel to the other side.
      setupFileSharing(win, pc.createDataChannel("SocialAPI", {}), target);
    }

    // sending chat.
    win.document.getElementById("chatForm").onsubmit = function() {
      var localChat = win.document.getElementById("localChat");
      var message = localChat.value;
      gChats[target].dc.send(message);
      localChat.value = "";
      // XXX: Sometimes insertChatMessage throws an exception, don't know why yet.
      try {
        insertChatMessage(win, "Me", message);
      } catch(e) {}
      return false;
    };
    win.document.getElementById("localChat").removeAttribute("disabled");
  };

  pc.onclosedconnection = function() {
  };
}

function insertChatMessage(win, from, message) {
  var box = win.document.getElementById("chat");
  box.innerHTML += "<span class=\"" + from + "\">" + from + "</span>: " + message + "<br/>";
  box.scrollTop = box.scrollTopMax;
}

function gotChat(win, evt) {
  if (evt.data instanceof Blob) {
    // for file transfer.
    saveAs(evt.data, filename);
  } else {
    // either an incoming file or chat.
    try {
      var details = JSON.parse(evt.data);
      if (details.type == "file") {
        filename = details.filename;
      } else if (details.type == "url") {
        win.open(details.url);
      } else {
        throw new Error("JSON, but not a file");
      }
    } catch(e) {
      insertChatMessage(win, "Them", evt.data);
    }
  }
}

function setupFileSharing(win, dc, target) {
  /* Setup data channel */
  dc.binaryType = "blob";
  dc.onmessage = function(evt) {
    gotChat(win, evt);
  };
  gChats[target].dc = dc;

  /* Setup drag and drop for file transfer */
  var box = win.document.getElementById("content");
  box.addEventListener("dragover", ignoreDrag, false);
  box.addEventListener("dragleave", ignoreDrag, false);
  box.addEventListener("drop", handleDrop, false);

  function ignoreDrag(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";

    if (e.type == "dragover") {
      win.document.getElementById("fileDrop").style.display = "block";
    } else {
      win.document.getElementById("fileDrop").style.display = "none";
    }
  }

  function handleDrop(e) {
    ignoreDrag(e);
    var files = e.target.files || e.dataTransfer.files;
    if (files.length) {
      for (var i = 0, f; f = files[i]; i++) {
        dc.send(JSON.stringify({type: "file", filename: f.name}));
        dc.send(f);
      }
    } else {
      var url = e.dataTransfer.getData("URL");
      if (!url.trim()) {
        url = e.dataTransfer.mozGetDataAt("text/x-moz-text-internal", 0);
      }
      dc.send(JSON.stringify({type: "url", url: url}));
    }
  }
}

function setupExpandHandler(win) {
  win.document.getElementById("fullTab").onclick = function() {
    var tab = window.open(win.location);
    tab.addEventListener("DOMContentLoaded", function() {
      tab.document.title = win.document.title;

      var video = win.document.getElementById("remoteVideo");
      var newVideo = tab.document.getElementById("remoteVideo");
      newVideo.mozSrcObject = video.mozSrcObject;
      newVideo.play();
      newVideo.setAttribute("style", "position: fixed; top: 0; left: 0; z-index: 1; background: black;");

      var localVideo = win.document.getElementById("localVideo");
      var newLocalVideo = tab.document.getElementById("localVideo");
      newLocalVideo.mozSrcObject = localVideo.mozSrcObject;
      newLocalVideo.play();

      var resizeVideo = function() {
        var height = tab.innerHeight;
        var width = tab.innerWidth;
        var doc = tab.document;

        newVideo.setAttribute("width", width);
        newVideo.setAttribute("height", height);

        newLocalVideo.setAttribute("width", "108");
        newLocalVideo.setAttribute("height", "81");
        newLocalVideo.setAttribute("style", "position: fixed; z-index: 2;");
        newLocalVideo.style.top = (height - 81) + "px";
        newLocalVideo.style.left = (width - 108) + "px";
      };
      resizeVideo();
      tab.addEventListener("resize", resizeVideo);

      var button = tab.document.getElementById("fullTab");
      button.onclick = function() {
        tab.document.getElementById("video").mozRequestFullScreen();
      };
      button.textContent = "Full screen";
    });
  };
}

function setupEventSource() {
  var source = new EventSource("events");
  source.onerror = function(e) {
    reload();
  };

  source.addEventListener("ping", function(e) {}, false);

  source.addEventListener("userjoined", function(e) {
    if (e.data in gContacts) {
      return;
    }
    var button = $('<button class="userButton">' + e.data + '</button>');
    var c = $("<li>");
    $("#contacts").append(c.append(button));
    button.click(onContactClick);
    gContacts[e.data] = c;
  }, false);

  source.addEventListener("userleft", function(e) {
    if (!gContacts[e.data]) {
      return;
    }
    gContacts[e.data].remove();
    delete gContacts[e.data];
  }, false);

  source.addEventListener("offer", function(e) {
    var data = JSON.parse(e.data);
    openChat(data.from, function(aWin) {
      var win = gChats[data.from].win;
      var pc = new win.mozRTCPeerConnection();
      pc.onaddstream = function(obj) {
        var doc = win.document;
        var type = obj.type;
        if (type == "video") {
          var video = doc.getElementById("remoteVideo");
          video.mozSrcObject = obj.stream;
          video.play();
        } else if (type == "audio") {
          var audio = doc.getElementById("remoteAudio");
          audio.mozSrcObject = obj.stream;
          audio.play();
        } else {
          alert("receiver onaddstream of unknown type, obj = " + obj.toSource());
        }
      };
      setupDataChannel(false, pc, data.from);
      gChats[data.from].pc = pc;
      pc.setRemoteDescription(JSON.parse(data.request), function() {
        getAudioVideo(win, pc, function() {
          pc.createAnswer(function(answer) {
            pc.setLocalDescription(answer, function() {
              var randomPort = function() {
                return Math.round(Math.random() * 60535) + 5000;
              };
              var localPort = randomPort();
              var remotePort = randomPort();
              while (remotePort == localPort) // Avoid being extremely unlucky...
                remotePort = randomPort();
              $.ajax({type: 'POST', url: '/answer',
                      data: {to: data.from, request: JSON.stringify(answer),
                             callerPort: remotePort, calleePort: localPort}});
              pc.connectDataConnection(localPort, remotePort);
            }, function(err) {alert("failed to setLocalDescription, " + err);});
          }, function(err) {alert("failed to createAnswer, " + err);});
        }, true);
      }, function(err) {alert("failed to setRemoteDescription, " + err);});
    });
  }, false);

  source.addEventListener("answer", function(e) {
    var data = JSON.parse(e.data);
    var pc = gChats[data.from].pc;
    pc.setRemoteDescription(JSON.parse(data.request), function() {
      // Nothing to do for the audio/video. The interesting things for
      // them will happen in onaddstream.
      // We need to establish the data connection though.
      pc.connectDataConnection(data.callerPort, data.calleePort);
    }, function(err) {alert("failed to setRemoteDescription with answer, " + err);});
  }, false);

  source.addEventListener("call", function(e) {
    var data = JSON.parse(e.data);
    callPerson(data.who);
  }, false);

  source.addEventListener("stopcall", function(e) {
    var data = JSON.parse(e.data);
    var chat = gChats[data.from];
    if (!chat) {
      // The chat to close doesn't exist any more...
      return;
    }
    chat.pc.close();
    if (chat.dc)
      chat.dc.close();
    delete gChats[data.from];
    chat.win.close();
  });
}

function userIsConnected(userdata) {
  $("#userid").text(userdata.userName);
  $("#usericon").attr("src", userdata.portrait);
  $("#useridbox").show();
  $("#usericonbox").show();
  $("#signin").hide();
  $("#content").show();
  setupEventSource();
}

function userIsDisconnected() {
  $("#signin").show();
  $("#content").hide();
  $("#userid").text("");
  $("#usericon").attr("src", "");
  $("#useridbox").hide();
  $("#usericonbox").hide();
}

var messageHandlers = {
  "worker.connected": function(data) {
    // our port has connected with the worker, do some initialization
    // worker.connected is our own custom message
    var worker = navigator.mozSocial.getWorker();
    worker.port.postMessage({topic: "broadcast.listen", data: true});
  },
  "social.user-profile": function(data) {
    if (data.userName) {
      userIsConnected(data);
    } else {
      userIsDisconnected();
    }
  }
};

navigator.mozSocial.getWorker().port.onmessage = function onmessage(e) {
  var topic = e.data.topic;
  var data = e.data.data;
  if (messageHandlers[topic]) {
    messageHandlers[topic](data);
  }
};

function reload() {
  document.cookie = 'userdata=; expires=Fri, 27 Jul 2001 02:47:11 UTC; path=/';
  navigator.mozSocial.getWorker()
           .port.postMessage({topic: "worker.reload", data: true});
  window.location.reload();
}

function openChat(aTarget, aCallback) {
  navigator.mozSocial.openChatWindow("./chatWindow.html?id="+(aTarget), function(win) {
    gChats[aTarget] = {win: win, pc: null};
    win.document.title = aTarget;
    setupExpandHandler(win);
    win.addEventListener("unload", function() {
      if (!(aTarget in gChats))
        return;
      stopCall(aTarget);
      var chat = gChats[aTarget];
      chat.pc.close();
      if (chat.dc)
        chat.dc.close();
      delete gChats[aTarget];
    });
    if (aCallback) {
      aCallback(win);
    }
  });
}

var chatters = 0;
function notify(type) {
  var port = navigator.mozSocial.getWorker().port;
  // XXX shouldn't need a full url here.
  var end = location.href.indexOf("sidebar.htm");
  var baselocation = location.href.substr(0, end);
  switch (type) {
    case "link":
      data = {
        id: "foo",
        type: null,
        icon: baselocation+"/icon.png",
        body: "This is a cool link",
        action: "link",
        actionArgs: {
          toURL: baselocation
        }
      };
      port.postMessage({topic:"social.notification-create", data: data});
      break;
    case "chat-request":
      port.postMessage({topic:"social.request-chat", data: baselocation+"/chatWindow.html?id="+(chatters++)});
      break;
  }
}
