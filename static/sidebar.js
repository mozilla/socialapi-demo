var gContacts = {};
var gChats = {};
var gUsername = "";
var gFake = false;

function onPersonaLogin(assertion) {
  $("#guest").hide();
  $("#signin").hide();
  remoteLogin({assertion: assertion});
}

function onPersonaLogout(assertion) {
  if (gUsername)
    remoteLogout();
}

function onPersonaReady() {
  if (gUsername || remoteLoginPending)
    return;
  $("#guest").show();
  $("#signin").show();
}

function onLoad() {
  var worker = navigator.mozSocial.getWorker();
  if (!worker) {
    document.body.style.border = "3px solid red";
  }

  watchPersonaLogins(onPersonaLogin, onPersonaLogout, onPersonaReady);
}

function onContactClick(aEvent) {
  callPerson(aEvent.target.getAttribute("user"),
             aEvent.target.getAttribute("call") == "audio");
}

function callPerson(aPerson, aAudioCall) {
  // Check first if the person is already calling us...
  if (aPerson in gChats) {
    // If a call is ringing, accept it.
    var doc = gChats[aPerson].win.document;
    if (doc.getElementById("callAnswer").style.display == "block")
      doc.getElementById("accept").onclick();
    return;
  }

  openChat(aPerson, function(aWin) {
    var win = gChats[aPerson].win;
    var doc = win.document;
    doc.getElementById("calling").style.display = "block";
    gChats[aPerson].pc = webrtcMedia.startCall(aPerson, win, aAudioCall,
                                               onConnection, setupFileSharing);
    gChats[aPerson].audioOnly = aAudioCall;
  });
}

function startGuest() {
  $("#signin").hide();
  $("#guest").html('<form onsubmit="javascript:guestLogin(event);">' +
    ' <input type="text" id="user"/>' +
    ' <input type="submit" value="Login"/>' +
    '</form>'
  );
  $("#user").focus();
}

function guestLogin(event) {
  var user = $("#user").attr("value");
  remoteLogin({assertion: user, fake: true});
  gFake = true;
  event.preventDefault();
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
  window.addEventListener("unload", function() {
    document.cookie = 'userdata=; expires=Fri, 27 Jul 2001 02:47:11 UTC; path=/';
  });

  gUsername = aEmail;
  gContacts[aEmail] = $("<li>"); // Avoid displaying the user in the contact list.
}

function onSignout() {
  if (!gFake)
    signout();
  else {
    gFake = false;
    onPersonaLogout();
  }
}

function signedOut() {
  delete gContacts[gUsername];
  gUsername = "";

  reload();
}

function onConnection(aWin, aPc, aPerson, aOriginator) {
}

function insertChatMessage(win, from, message) {
  var box = win.document.getElementById("chat");
  box.innerHTML += "<span class=\"" + from + "\">" + from + "</span>: " + message + "<br/>";
  box.scrollTop = box.scrollTopMax;
}

var filename = "default.txt";

function handleFile(win, blob) {
  var url = win.URL.createObjectURL(blob);

  // If the file extension is known, just open the file in a new tab.
  const ext = ["jpg", "jpeg", "gif", "png", "pdf", "txt"];
  if (ext.indexOf(filename.split(".").pop().toLowerCase()) != -1)
    win.open(url);
  else {
    // Otherwise offer to save the file.
    // We create a fake link to use its .download property that lets
    // us set the filename that will be shown to the user in the
    // download dialog.
    var a = win.document.createElement("a");
    a.href = url;
    a.download = filename;
    var event = win.document.createEvent("MouseEvents");
    event.initMouseEvent("click", true, false, win, 0, 0, 0, 0, 0,
                         false, false, false, false, 0, null);
    a.dispatchEvent(event); // false if event was cancelled
  }
}

function gotChat(win, evt) {
  if (evt.data instanceof Blob) {
    // for file transfer.
    handleFile(win, evt.data);
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

function setupFileSharing(aWin, aIncomingChannel, aOutgoingChannel, aTarget) {
  /* Setup data channel */
  aOutgoingChannel.binaryType = "blob";
  aIncomingChannel.onmessage = function(evt) {
    gotChat(aWin, evt);
  };
  gChats[aTarget].incomingChannel = aIncomingChannel;
  gChats[aTarget].outgoingChannel = aOutgoingChannel;

  /* Setup drag and drop for file transfer */
  var box = aWin.document.getElementById("content");
  box.addEventListener("dragover", ignoreDrag, false);
  box.addEventListener("dragleave", ignoreDrag, false);
  box.addEventListener("drop", handleDrop, false);

  // Now set up the chat interface
  aWin.document.getElementById("chatForm").onsubmit = function() {
    var localChat = aWin.document.getElementById("localChat");
    var message = localChat.value;
   aOutgoingChannel.send(message);
    localChat.value = "";
    // XXX: Sometimes insertChatMessage throws an exception, don't know why yet.
    try {
      insertChatMessage(aWin, "Me", message);
    } catch(e) {}
    return false;
  };
  aWin.document.getElementById("localChat").removeAttribute("disabled");

  function ignoreDrag(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";

    if (e.type == "dragover") {
      aWin.document.getElementById("fileDrop").style.display = "block";
    } else {
      aWin.document.getElementById("fileDrop").style.display = "none";
    }
  }

  function handleDrop(e) {
    ignoreDrag(e);
    var files = e.target.files || e.dataTransfer.files;
    if (files.length) {
      for (var i = 0, f; f = files[i]; i++) {
        aOutgoingChannel.send(JSON.stringify({type: "file", filename: f.name}));
        aOutgoingChannel.send(f);
      }
    } else {
      var url = e.dataTransfer.getData("URL");
      if (!url.trim()) {
        url = e.dataTransfer.mozGetDataAt("text/x-moz-text-internal", 0);
      }
      aOutgoingChannel.send(JSON.stringify({type: "url", url: url}));
    }
  }
}

function finishDetachTab(aWindow) {
  var doc = aWindow.document;
  var localVideo = doc.getElementById("localVideo");
  var video = doc.getElementById("remoteVideo");
  video.setAttribute("style", "position: fixed; top: 0; left: 0; z-index: 1; background: black;");

  var resizeVideo = function() {
    var height = aWindow.innerHeight;
    var width = aWindow.innerWidth;

    video.setAttribute("width", width);
    video.setAttribute("height", height);

    localVideo.setAttribute("width", "108");
    localVideo.setAttribute("height", "81");
    localVideo.setAttribute("style", "position: fixed; z-index: 2;");
    localVideo.style.top = (height - 81) + "px";
    localVideo.style.left = (width - 108) + "px";
  };
  resizeVideo();
  aWindow.addEventListener("resize", resizeVideo);

  var button = doc.getElementById("fullTab");
  button.onclick = function() {
    doc.getElementById("video").mozRequestFullScreen();
  };
  button.textContent = "Full screen";
}

function setupExpandHandler(win) {
  win.document.getElementById("fullTab").onclick = function() {
    var doc = win.document;
    var event = doc.createEvent("UIEvents");
    event.initUIEvent("detachToTab", true, true, win, 0);
    win.dispatchEvent(event);

    if (!event.defaultPrevented) {
      // The add-on isn't installed, fallback to opening a new tab and
      // keeping the floating window around.
      var tab = win.open(win.location);
      tab.addEventListener("DOMContentLoaded", function() {
        tab.document.title = win.document.title;

        var video = doc.getElementById("remoteVideo");
        var newVideo = tab.document.getElementById("remoteVideo");
        newVideo.mozSrcObject = video.mozSrcObject;
        newVideo.play();

        var localVideo = doc.getElementById("localVideo");
        var newLocalVideo = tab.document.getElementById("localVideo");
        newLocalVideo.mozSrcObject = localVideo.mozSrcObject;
        newLocalVideo.play();
        finishDetachTab(tab);
      });
    }
    else
      finishDetachTab(doc.defaultView);
  };
}

function hideVideo(aDoc) {
  aDoc.getElementById("fullTab").style.display = "none";
  aDoc.getElementById("video").style.display = "none";
  aDoc.getElementById("chat").setAttribute("style", "top: 0; height: 246px;");
}

function setupEventSource() {
  var source = new EventSource("events?source=sidebar");
  source.onerror = function(e) {
    reload();
  };

  source.addEventListener("ping", function(e) {}, false);

  source.addEventListener("userjoined", function(e) {
    if (e.data in gContacts) {
      return;
    }
    var contact = $('<li class="contact">');
    // Add the picture
    contact.append($('<div class="userName">' + e.data + '</div>'));
    var userButtons = $('<div class="userButtons">');
    var userButton = $('<button class="userButtonVideo" user="' + e.data + '" call="video"/>');
    userButton.click(onContactClick);
    userButtons.append(userButton);
    userButton = $('<button class="userButtonAudio" user="' + e.data + '" call="audio"/>');
    userButton.click(onContactClick);
    userButtons.append(userButton);
    contact.append(userButtons);
    $("#contacts").append(contact);
    gContacts[e.data] = contact;
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
    var from = data.from;

    // Silently drop calls from people already calling us.
    // The server won't cancel the ongoing call if there's a pending call.
    if (from in gChats) {
      stopCall(from);
      return;
    }

    openChat(from, function(aWin) {
      var win = gChats[from].win;
      var doc = win.document;
      var offer = JSON.parse(data.request);
      offer.sdp = offer.sdp.split("m=").filter(function(s) {
        return !s.startsWith("video") || s.indexOf("a=recvonly") == -1;
      }).join("m=");
      gChats[from].audioOnly = offer.sdp.indexOf("m=video") == -1;

      doc.getElementById("callAnswer").style.display = "block";
      doc.getElementById("reject").onclick = function() {
        win.close();
      };
      doc.getElementById("accept").onclick = function() {
        doc.getElementById("callAnswer").style.display = "none";
        var chat = gChats[from];
        chat.pc = webrtcMedia.handleOffer(data, win, chat.audioOnly,
                                          onConnection, setupFileSharing);
        if (chat.audioOnly)
          hideVideo(chat.win.document);
      };
    });
  }, false);

  source.addEventListener("answer", function(e) {
    var data = JSON.parse(e.data);
    var chat = gChats[data.from];
    var doc = chat.win.document;
    var answer = JSON.parse(data.request);
    var pc = chat.pc;
    if (!chat.audioOnly && answer.sdp.indexOf("m=video") == -1) {
      chat.audioOnly = true;
      var audio = doc.getElementById("localAudio");
      var video = doc.getElementById("localVideo");
      // Using the audio+video stream as audio only has the
      // unfortunate effect of keeping the webcam active...
      audio.mozSrcObject = video.mozSrcObject;
      video.mozSrcObject = null;
    }
    doc.getElementById("calling").style.display = "none";
    if (chat.audioOnly)
      hideVideo(doc);
    pc.setRemoteDescription(answer, function() {
      // Nothing to do for the audio/video. The interesting things for
      // them will happen in onaddstream.
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
    webrtcMedia.endCall(chat.pc, chat.incomingChannel, chat.outgoingChannel,
                        chat.win, chat.audioOnly);
    delete gChats[data.from];
    chat.win.close();
  });

  window.addEventListener("beforeunload", function() {
    source.onerror = null;
    source.close();
  }, true);
}

function userIsConnected(userdata) {
  $("#userid").text(userdata.userName);
  $("#usericon").attr("src", userdata.portrait);
  $("#signedin").show();
  $("#content").show();
  setupEventSource();
}

function userIsDisconnected() {
  $("#content").hide();
  $("#userid").text("");
  $("#usericon").attr("src", "");
  $("#signedin").hide();
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
      webrtcMedia.endCall(chat.pc, chat.dc, chat.win, chat.audioOnly);
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
