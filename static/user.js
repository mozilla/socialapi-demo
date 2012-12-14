var gUserEmail;
var gContacts = {};

function signedIn(aEmail) {
  gUserEmail = aEmail;
  $("#useridbox").text("Welcome " + aEmail + "!");
  $("#useridbox").show();
  $("#nouserid").hide();
  $("#signin").hide();
  $("#signout").show();
  gContacts[aEmail] = $("<li>"); // Avoid displaying the user in the contact list.
  setupEventSource();
}

function signedOut() {
  gUserEmail = "";
  $("#useridbox").text("");
  $("#useridbox").hide();
  $("#nouserid").show();
  $("#signin").show();
  $("#signout").hide();
  window.location.reload();
}

function onContactClick(aEvent) {
  initiateCall(aEvent.target.innerHTML);
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

function setupEventSource() {
  var source = new EventSource("events?source=user");
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
}
