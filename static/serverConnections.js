var remoteLoginPending = false;

function remoteLogin(options) {
  remoteLoginPending = true;
  $.ajax({
    type: 'POST',
    url: '/login',
    contentType: 'application/json',
    data: JSON.stringify(options),
    success: function(res, status, xhr) { signedIn(xhr.responseText); },
    error: function(xhr, status, err) { alert("login failure " + err); }
  });
}

function remoteLogout() {
  $.ajax({
    type: 'POST',
    url: '/logout',
    contentType: 'application/json',
    data: '{}',
    success: function(res, status, xhr) { signedOut(); },
    error: function(xhr, status, err) { signOutFailure(xhr, status, err); }
  });
}

function initiateCall(aUser) {
  var options = { who: aUser };
  $.ajax({
    type: 'POST',
    url: '/call',
    contentType: 'application/json',
    data: JSON.stringify(options),
    success: function(res, status, xhr) {},
    error: function (xhr, status, err) { alert("call initiation failure " + err + " " + status); }
  });
}

function signOutFailure(xhr, status, err) {
  if (xhr.status == 401) {
    // We've already been logged out, so just make sure we're signed out visually.
    signedOut();
    return;
  }
  alert("Sign out failure: " + err);
}

function stopCall(aUser, aReason) {
  $.ajax({
    type: 'POST',
    url: '/stopcall',
    contentType: 'application/json',
    data: JSON.stringify({to: aUser, reason: aReason})
  });
}
