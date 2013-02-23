var webrtcChecks = {
  checkSupport: function webrtc_checkSupport(aDisplaySuccess) {
    if (!this.hasWebRTC())
      this.displayWarning();
    else {
      if (aDisplaySuccess)
        this.displaySuccess();
      this.checkPersona();
    }
  },

  hasWebRTC: function webrtc_hasWebRTC() {
    if (!navigator.mozGetUserMedia)
      return false;
    try {
      var dummy = new window.mozRTCPeerConnection({iceServers: []});
    } catch (x) {
      return false;
    }
    return true;
  },

  checkSidebarSupport: function webrtc_checkSidebarSupport() {
    if (!this.hasWebRTC())
      this.displaySidebarWarning();

    this.checkPersona();
  },

  checkPersona: function webrtc_checkPersona() {
    if (navigator.id)
      return;

    // If Persona isn't available, we are likely on a network without
    // Internet access, tell webrtcMedia about it and start guest login
    // automatically.
    webrtcMedia.hasInternetAccess = false;
    $("#guest").show();
    startGuest();
  },

  displayWarning: function webrtc_displayWarning() {
    $("#supportwarning").append('<p>To run this demo, please first install and latest <a href="https://nightly.mozilla.org/">Nightly</a> version of Mozilla Firefox.</p>' +
      '<p>Then install <a href="webrtc.xpi">this add-on</a>. You may need to restart for the social api update to take full effect.</p>').show();
  },

  displaySuccess: function webrtc_displaySuccess() {
    $("#supportwarning").append('<p>Congratulations, you appear to have the right support to run this demo. You can either:</p>' +
      '<ul><li>Visit the <a href="mobile.html">Mobile test page</a></li>' +
      '<li>or install <a href="webrtc.xpi">this add-on</a> to access it via the SocialAPI.</li>' +
      '<ul><li><i>Note: you may need to restart after installing the add-on for the social API to fully start</i></li></ul>' +
      '</ul>' +
      '<p>If you get issues, please try running the latest <a href="https://nightly.mozilla.org/">nightly of Firefox</p>').show();

  },

  displaySidebarWarning: function webrtc_displaySidebarWarning() {
    $("#supportwarning").append("<p>Your browser is not set up correctly or is not the right version, please <a href='/' target='_blank'>visit the homepage</a> for instructions on how to set it up.</p>").show();
  }
}
