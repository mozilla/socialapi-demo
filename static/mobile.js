var gUsername;
var gContacts = {};
var gChat;
var gFake = false;

function startGuest() {
  $("#signin").hide();
  $("#guest").html(
    '<input type="text" id="user"/>' +
    '<input type="button" value="Login" onclick="javascript:guestLogin();"/>'
  );
  $("#user").focus();
}

function guestLogin() {
  var user = $("#user").attr("value");
  remoteLogin({assertion: user, fake: true});
  gFake = true;
}

function signedIn(aEmail) {
  gUsername = aEmail;
  $("#useridbox").text("Welcome " + aEmail + "!");
  $("#useridbox").show();
  $("#nouserid").hide();
  $("#signin").hide();
  $("#guest").hide();
  $("#signout").show();
  gContacts[aEmail] = $("<li>"); // Avoid displaying the user in the contact list.
  setupEventSource();
}

function signedOut() {
  gUsername = "";
  $("#useridbox").text("");
  $("#useridbox").hide();
  $("#nouserid").show();
  $("#signout").hide();
  window.location.reload();
}

function onSignout() {
  if (!gFake)
    signout();
  else {
    gFake = false;
    onPersonaLogout();
  }
}

function onPersonaLogin(assertion) {
  $("#signin").hide();
  $("#guest").hide();
  remoteLogin({assertion: assertion});
}

function onPersonaLogout() {
  remoteLogout();
}

function onPersonaReady() {
  if (gUsername || remoteLoginPending)
    return;
  $("#signin").show();
  $("#guest").show();
}

function onLoad() {
  watchPersonaLogins(onPersonaLogin, onPersonaLogout, onPersonaReady);
}

function onContactClick(aEvent) {
  callPerson(aEvent.target.getAttribute("user"));
}

function callPerson(aPerson) {
  if (gChat)
    return;

  gChat = {who: aPerson};
  gChat.audioOnly = !document.getElementById("shareCamera").checked;

  $("#calling").show();
  document.getElementById("calleeName").textContent = aPerson;

  $("#call").show();
  $("#header").hide();
  $("#contacts").hide();

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
  gChat.pc = pc;
  (gChat.audioOnly ? getAudioOnly : getAudioVideo)(window, pc, function() {
    pc.createOffer(function(offer) {
      pc.setLocalDescription(offer, function() {
        $.ajax({type: 'POST', url: '/offer',
                data: {to: aPerson, request: JSON.stringify(offer)}});},
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
  var source = new EventSource("events?source=mobile");
  source.onerror = function(e) {
    window.location.reload();
  };

  source.addEventListener("ping", function(e) {}, false);

  source.addEventListener("userjoined", function(e) {
    if (e.data in gContacts) {
      return;
    }
    var button = $('<button class="callButton" user="'+ e.data + '">Call</button>');
    var c = $("<li>" + e.data + "</li>");
    c.append(button);
    $("#contactslist").append(c);
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

    var data = JSON.parse(e.data);
    gChat = {who: data.from};

    $("#callAnswer").show();
    document.getElementById("callerName").textContent = data.from;
    document.getElementById("reject").onclick = function() {closeCall();};
    document.getElementById("accept").onclick = function() {
      $("#callAnswer").hide();
      $("#call").show();
      $("#header").hide();
      $("#contacts").hide();

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
      gChat.pc = pc;
      pc.setRemoteDescription(JSON.parse(data.request), function() {
        getAudioVideo(window, pc, function() {
          pc.createAnswer(function(answer) {
            pc.setLocalDescription(answer, function() {
              $.ajax({type: 'POST', url: '/answer',
                      data: {to: data.from, request: JSON.stringify(answer)}});
              pc.connectDataConnection(5001,5000);
            }, function(err) {alert("failed to setLocalDescription, " + err);});
          }, function(err) {alert("failed to createAnswer, " + err);});
        }, true);
      }, function(err) {alert("failed to setRemoteDescription, " + err);});
    };
  }, false);

  source.addEventListener("answer", function(e) {
    var data = JSON.parse(e.data);
    var pc = gChat.pc;
    pc.setRemoteDescription(JSON.parse(data.request), function() {
      // Nothing to do for the audio/video. The interesting things for
      // them will happen in onaddstream.
      // We need to establish the data connection though.
      pc.connectDataConnection(5000,5001);
    }, function(err) {alert("failed to setRemoteDescription with answer, " + err);});
  }, false);

  source.addEventListener("stopcall", function(e) {
    var data = JSON.parse(e.data);
    if (!gChat)
      // XXX alert or log?
      return;

    endCall();
  }, false);

  window.addEventListener("beforeunload", function() {
    source.onerror = null;
    source.close();
  }, true);
}

function closeCall() {
  if (!gChat)
    return;

  stopCall(gChat.who);
  endCall();
}

function endCall() {
  $("#callAnswer").hide();
  $("#calling").hide();
  document.getElementById("accept").onclick = null;
  document.getElementById("reject").onclick = null;

  var mediaElements = ["remoteAudio", "localAudio"];
  if (!gChat.audioOnly)
    mediaElements = mediaElements.concat("remoteVideo", "localVideo");
  mediaElements.forEach(function (aElemId) {
    var element = document.getElementById(aElemId);
    element.pause();
    if (aElemId.indexOf("local") != -1) {
      if (gChat.pc)
        gChat.pc.removeStream(element.mozSrcObject);
      if (element.mozSrcObject)
        element.mozSrcObject.stop();
    }
    element.mozSrcObject = null;
  });

  if (gChat.pc)
    gChat.pc.close();
  // XXX Don't need to close data connection just yet.
  gChat = null;

  $("#call").hide();
  $("#header").show();
  $("#contacts").show();
}
