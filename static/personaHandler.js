// Functions to make handling Persona login/logout easier and simpler.

function watchPersonaLogins(aLoginFunc, aLogoutFunc) {
  if (navigator.id) {
    navigator.id.watch({
      loggedInUser: null,
      onlogin: function(assertion) {
        if (aLoginFunc)
          aLoginFunc(assertion);
      },
      onlogout: function() {
        if (aLogoutFunc)
          aLogoutFunc();
      }
    });
  }
}

function signin() {
  navigator.id.request();
}

function signout() {
  navigator.id.logout();
}
