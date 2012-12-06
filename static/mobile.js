var gUsername;
var gContacts = {};
var gChat;

function signedIn(aEmail) {
  gUsername = aEmail;
  $("#useridbox").text("Welcome " + aEmail + "!");
  $("#useridbox").show();
  $("#nouserid").hide();
  $("#signin").hide();
  $("#signout").show();
  gContacts[aEmail] = $("<li>"); // Avoid displaying the user in the contact list.
  setupEventSource();
}

function signedOut() {
  gUsername = "";
  $("#useridbox").text("");
  $("#useridbox").hide();
  $("#nouserid").show();
  $("#signin").show();
  $("#signout").hide();
  window.location.reload();
}

function onPersonaLogin(assertion) {
  // XXX this generates a second log in at the server, but we need it for remote connections.
  remoteLogin({assertion: assertion});
}

function onPersonaLogout() {
  // XXX Assume the sidebar handles the remote part of this.
  // We'll need to keep an eye out for changes if we close the sidebar.
  remoteLogout();
}

function onLoad() {
  watchPersonaLogins(onPersonaLogin, onPersonaLogout);
}

function onContactClick(aEvent) {
  callPerson(aEvent.target.innerHTML);
}

function callPerson(aPerson) {
  if (gChat)
    return;

  $("#content").show();

  var pc = new window.mozRTCPeerConnection();
  pc.onaddstream = function(obj) {
    var type = obj.type;
    if (type == "video") {
      var video = document.getElementById("remoteVideo");
      video.mozSrcObject = obj.stream;
      video.play();
    } else if (type == "audio") {
      var audio = document.getElementById("remoteAudio");
      audio.mozSrcObject = obj.stream;
      audio.play();
    } else {
      alert("sender onaddstream of unknown type, obj = " + obj.toSource());
    }
  };
  setupDataChannel(true, pc, aPerson);
  gChat = pc;
  getAudioVideo(window, pc, function() {
    pc.createOffer(function(offer) {
      pc.setLocalDescription(offer, function() {
        $.ajax({type: 'POST', url: '/offer',
                data: {to: aPerson, from: gUsername, request: JSON.stringify(offer)}});},
        function(err) { alert("setLocalDescription failed: " + err); });
    }, function(err) { alert("createOffer failed: " + err); });
  });
}

var filename = "default.txt";
function setupDataChannel(originator, pc, target) {
//  var win = gChats[target].win;

  pc.ondatachannel = function(channel) {
//    setupFileSharing(win, channel, target);
  };

  pc.onconnection = function() {
/*    if (originator) {
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
    };*/
  };

  pc.onclosedconnection = function() {
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
    if (gChat)
      return;

    $("#content").show();

    var data = JSON.parse(e.data);
    var pc = new window.mozRTCPeerConnection();
    pc.onaddstream = function(obj) {
      var type = obj.type;
      if (type == "video") {
        var video = document.getElementById("remoteVideo");
        video.mozSrcObject = obj.stream;
        video.play();
      } else if (type == "audio") {
        var audio = document.getElementById("remoteAudio");
        audio.mozSrcObject = obj.stream;
        audio.play();
      } else {
        alert("receiver onaddstream of unknown type, obj = " + obj.toSource());
      }
    };
    setupDataChannel(false, pc, data.from);
    gChat = pc;
    pc.setRemoteDescription(JSON.parse(data.request), function() {
      getAudioVideo(window, pc, function() {
        pc.createAnswer(function(answer) {
          pc.setLocalDescription(answer, function() {
            $.ajax({type: 'POST', url: '/answer',
                    data: {to: data.from, from: data.to, request: JSON.stringify(answer)}});
            pc.connectDataConnection(5001,5000);
          }, function(err) {alert("failed to setLocalDescription, " + err);});
        }, function(err) {alert("failed to createAnswer, " + err);});
      }, true);
    }, function(err) {alert("failed to setRemoteDescription, " + err);});
  }, false);

  source.addEventListener("answer", function(e) {
    var data = JSON.parse(e.data);
    var pc = gChat;
    pc.setRemoteDescription(JSON.parse(data.request), function() {
      // Nothing to do for the audio/video. The interesting things for
      // them will happen in onaddstream.
      // We need to establish the data connection though.
      pc.connectDataConnection(5000,5001);
    }, function(err) {alert("failed to setRemoteDescription with answer, " + err);});
  }, false);
}
