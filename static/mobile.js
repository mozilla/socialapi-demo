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

  gChat = {who: aPerson,
           audioOnly: !document.getElementById("shareCamera").checked};

  $("#calling").show();
  document.getElementById("calleeName").textContent = aPerson;

  $("#call").show();
  $("#header").hide();
  $("#contacts").hide();

  gChat.pc = webrtcMedia.startCall(aPerson, window, gChat.audioOnly, onConnection, setupChat);
}

var filename = "default.txt";

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
    var audioOnly = JSON.parse(data.request).sdp.indexOf("m=video") == -1;
    gChat = {who: data.from, audioOnly: audioOnly};

    $("#callAnswer").show();
    document.getElementById("callerName").textContent = data.from;
    document.getElementById("reject").onclick = function() {closeCall();};
    document.getElementById("accept").onclick = function() {
      $("#callAnswer").hide();
      $("#call").show();
      $("#header").hide();
      $("#contacts").hide();

      if (!document.getElementById("shareCamera").checked)
        gChat.audioOnly = audioOnly = true;
      gChat.pc = webrtcMedia.handleOffer(data, window, audioOnly, onConnection, setupChat);
    };
  }, false);

  source.addEventListener("answer", function(e) {
    var data = JSON.parse(e.data);
    var pc = gChat.pc;
    pc.setRemoteDescription(JSON.parse(data.request), function() {
      // Nothing to do for the audio/video. The interesting things for
      // them will happen in onaddstream.
      // We need to establish the data connection though.
      if (data.callerPort && data.calleePort)
        pc.connectDataConnection(data.callerPort, data.calleePort);
    }, function(err) {alert("failed to setRemoteDescription with answer, " + err);});
  }, false);

  source.addEventListener("stopcall", function(e) {
    var data = JSON.parse(e.data);
    if (!gChat)
      // XXX alert or log?
      return;

    if (gChat.who === data.from)
      endCall();
  }, false);

  window.addEventListener("beforeunload", function() {
    source.onerror = null;
    source.close();
  }, true);
}

function onConnection(aWin, aPc, aPerson, aOriginator) {
  if (aOriginator)
    setupChat(aWin, aPc.createDataChannel("SocialAPI", {}));
}

function setupChat(aWin, aChannel) {
  aChannel.binaryType = "blob";
  aChannel.onmessage = function(evt) {
    insertChatMessage("Them", evt.data);
  }

  document.getElementById("chatForm").onsubmit = function() {
    var localChat = document.getElementById("localChat");
    var message = localChat.value;
    aChannel.send(message);
    localChat.value = "";
    insertChatMessage("Me", message);
    return false;
  };
  document.getElementById("localChat").removeAttribute("disabled");
}

function insertChatMessage(aFrom, aMessage) {
  var box = document.getElementById("chat");
  box.innerHTML += "<span class=\"" + aFrom + "\">" + aFrom + "</span>: " + aMessage + "<br/>";
  box.scrollTop = box.scrollTopMax;
}

function cleanChat() {
  var box = document.getElementById("chat");
  box.innerHTML = '';
  document.getElementById("localChat").setAttribute("disabled", "disabled");
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

  webrtcMedia.endCall(gChat.pc, null, window, gChat.audioOnly);
  gChat = null;

  $("#call").hide();
  $("#header").show();
  $("#contacts").show();

  cleanChat();
}
