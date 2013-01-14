Components.utils.import("resource://gre/modules/Services.jsm");

const kSiteURL = "https://webrtc-demo.vcap.mozillalabs.com";
const kSiteName = "WebRTC Social Demo";
const kSidebarPage = "/sidebar.htm";
const kSiteImageLocation = "/icon.png";
const kPrefName = "social.manifest.webrtc-demo";
const kUserImageLocation = "/icon.png";

const BOOTSTRAP_REASONS = {
  APP_STARTUP     : 1,
  APP_SHUTDOWN    : 2,
  ADDON_ENABLE    : 3,
  ADDON_DISABLE   : 4,
  ADDON_INSTALL   : 5,
  ADDON_UNINSTALL : 6,
  ADDON_UPGRADE   : 7,
  ADDON_DOWNGRADE : 8
};

let webrtcbrowser = {
  setWidths: function webrtcbrowser_setWidths() {
    try {
      var windows = Services.ww.getWindowEnumerator();
      while (windows.hasMoreElements()) {
        var window = windows.getNext().QueryInterface(Components.interfaces.nsIDOMWindow);
        if (window.location.href == "chrome://browser/content/browser.xul") {
          window.document.getElementById("social-sidebar-browser").setAttribute("style", "min-width: 14em; width: 235px; max-width: 36em;");
        }
      }
      Components.utils.reportError("setup");
    } catch (x) {
      Components.utils.reportError(x);
    }
  },

  addMeTabButton: function webrtcbrowser_addMeTabButton() {
    var currentProvider = "";
    try {
      currentProvider = Services.prefs.getCharPref("social.provider.current");
    } catch (x) {
    }

    // Don't do anything if we're not the current provider
    if (currentProvider != kSiteURL)
      return;

    try {
      var windows = Services.ww.getWindowEnumerator();
      while (windows.hasMoreElements()) {
        var window = windows.getNext().QueryInterface(Components.interfaces.nsIDOMWindow);

        if (window.location.href == "chrome://browser/content/browser.xul") {
          if (!window.Social._provider || !window.Social._provider.enabled ||
              !window.Social.haveLoggedInUser() || !window.Social._provider.profile)
            return;

          // Protect against double creations
          if (window.document.getElementById("social-notification-icon-webrtc-user-tab"))
            return;

          // Most of this is taken from http://mxr.mozilla.org/comm-central/source/mozilla/browser/base/content/browser-social.js / SocialToolbar_updateButton function.
          let iconContainers = window.document.createDocumentFragment();
          let iconBox = window.document.getElementById("social-toolbar-item");
          let iconId = "social-notification-icon-webrtc-user-tab";
          let imageId = iconId + "-image";
          let labelId = iconId + "-label";
          let stackId = iconId + "-stack";
          let box = window.document.createElement("box");
          box.classList.add("toolbarbutton-1");
          box.setAttribute("id", iconId);
          box.setAttribute("onmouseup", "SocialUI.showProfile();");
          let stack = window.document.createElement("stack");
          stack.setAttribute("id", stackId);
          stack.classList.add("social-notification-icon-stack");
          stack.classList.add("toolbarbutton-icon");
          let image = window.document.createElement("image");
          image.setAttribute("id", imageId);
          image.classList.add("social-notification-icon-image");
          image = stack.appendChild(image);
          box.appendChild(stack);
          iconContainers.appendChild(box);

          image.style.listStyleImage = "url(" + kSiteURL + kUserImageLocation + ")";

          iconBox.appendChild(iconContainers);
        }
      }
    } catch (x) {
      Components.utils.reportError(x);
    }
  },

  init: function webrtcbrowser_init() {
    try {
      Services.obs.addObserver(this, "social:profile-changed", false);
    } catch (x) {
      Components.utils.reportError(x);
    }
  },

  uninit: function webrtcbrowser_uninit() {
    Services.obs.removeObserver(this, "social:profile-changed");
  },

  observe: function webrtcbrowser_observe(subject, topic, data) {
    switch (topic) {
      case "social:profile-changed":
        this.addMeTabButton();
        break;
      case "browser-delayed-startup-finished":
        this.init();
        this.setWidths();
        break;
    }
  }
};

function startup(data, reason) {
  Components.utils.reportError("startup " + reason);
  switch (reason) {
    case BOOTSTRAP_REASONS.APP_STARTUP:
      Services.obs.addObserver(webrtcbrowser, "browser-delayed-startup-finished", false);
      break;
    case BOOTSTRAP_REASONS.ADDON_ENABLE:
    case BOOTSTRAP_REASONS.ADDON_INSTALL:
    case BOOTSTRAP_REASONS.ADDON_UPGRADE:
    case BOOTSTRAP_REASONS.ADDON_DOWNGRADE:
    default:
      webrtcbrowser.init();
      webrtcbrowser.setWidths();
      break;
  }
}

function shutdown(data, reason) {
  webrtcbrowser.uninit();

  switch(reason) {
    case BOOTSTRAP_REASONS.APP_SHUTDOWN:
    case BOOTSTRAP_REASONS.ADDON_DISABLE:
    case BOOTSTRAP_REASONS.ADDON_UNINSTALL:
    case BOOTSTRAP_REASONS.ADDON_UPGRADE:
    case BOOTSTRAP_REASONS.ADDON_DOWNGRADE:
    default:
      break;
  }
}

function install(data, reason) {
  switch(reason) {
    case BOOTSTRAP_REASONS.ADDON_INSTALL:
    case BOOTSTRAP_REASONS.ADDON_UPGRADE:
    case BOOTSTRAP_REASONS.ADDON_DOWNGRADE:
    {
      Services.prefs.setCharPref(kPrefName, '{"location":"' + kSiteURL + '/manifest.json","name":"' + kSiteName + '","iconURL":"' + kSiteURL + kSiteImageLocation + '","workerURL":"' + kSiteURL + '/worker.js","sidebarURL":"' + kSiteURL + kSidebarPage + '","origin":"' + kSiteURL + '","enabled":true,"last_modified":135101330568}');
      Services.prefs.setCharPref("social.provider.current", kSiteURL);
      var activeProviders;
      try {
        activeProviders = JSON.parse(Services.prefs.getCharPref("social.activeProviders"));
      } catch (x) {
        activeProviders = {};
      }

      activeProviders[kSiteURL] = 1;
      Services.prefs.setCharPref("social.activeProviders", JSON.stringify(activeProviders));

      Services.prefs.setBoolPref("media.navigator.enabled", true);
      Services.prefs.setBoolPref("media.navigator.permission.disabled", true);
      Services.prefs.setBoolPref("media.peerconnection.enabled", true);
      Services.prefs.setBoolPref("dom.disable_open_during_load", false);
      Services.prefs.setBoolPref("social.enabled", true);
      break;
    }
    default:
      break;
  }
}

function uninstall(data, reason) {
  Services.prefs.clearUserPref("social.enabled");
  Services.prefs.clearUserPref("media.navigator.enabled");
  Services.prefs.clearUserPref("media.navigator.permission.disabled");
  Services.prefs.clearUserPref("media.peerconnection.enabled");
  Services.prefs.clearUserPref("dom.disable_open_during_load");

  Services.prefs.clearUserPref(kPrefName);
  Services.prefs.clearUserPref("social.provider.current");

  var activeProviders;
  try {
    activeProviders = JSON.parse(Services.prefs.getCharPref("social.activeProviders"));
    delete activeProviders[kSiteURL];
    Services.prefs.setCharPref("social.activeProviders", JSON.stringify(activeProviders));
  } catch (x) {
    activeProviders = {};
  }
}
