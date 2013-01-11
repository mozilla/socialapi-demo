var webrtcChecks = {
  checkSupport: function webrtc_checkSupport(aDisplaySuccess) {
    if (!navigator.mozGetUserMedia || !navigator.id) {
      this.displayWarning();
      return;
    }

    try {
      var dummy = new window.mozRTCPeerConnection()
    } catch (x) {
      this.displayWarning();
      return;
    }

    if (aDisplaySuccess)
      this.displaySuccess();
  },

  displayWarning: function webrtc_displayWarning() {
    $("#supportwarning").append('<p><img src="defaultWarningIcon.png"/> To run this demo, please first install and latest <a href="https://nightly.mozilla.org/">Nightly</a> version of Mozilla Firefox.</p>' +
      '<p>Then install <a href="webrtc.xpi">this add-on</a>. You may need to restart for the social api update to take full effect.</p>');
  },

  displaySuccess: function webrtc_displaySuccess() {
    $("#supportwarning").append('<p>Congratulations, you appear to have the right support to run this demo. You can either:</p>' +
      '<ul><li>Visit the <a href="mobile.html">Mobile test page</a></li>' +
      '<li>or install <a href="webrtc.xpi">this add-on</a> to access it via the SocialAPI.</li>' +
      '<ul><li><i>Note: you may need to restart after installing the add-on for the social API to fully start</i></li></ul>' +
      '</ul>' +
      '<p>If you get issues, please try running the latest <a href="https://nightly.mozilla.org/">nightly of Firefox</p>');

  }
}
