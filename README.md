Social API + WebRTC Demo
========================

Quick Start
-----------
1. This demo requires Firefox 19+. Grab the latest [nightly](http://nightly.mozilla.org).

2. Create a new profile.  You don't want to be messing with all these prefs in a profile that you use regularly.

3. Set the following boolean prefs via about:config

        social.enabled: true
        social.active: true
        media.navigator.enabled: true
        media.navigator.permission.disabled: true
        media.peerconnection.enabled: true
        dom.disable_open_during_load: false

4. Set the SocialAPI provider, also via about:config. It's ok that the provider is named "facebook", the SocialAPI grabs the first pref prefixed with social.manifest. Note that the pref is actually a JSON string.

        social.manifest.facebook: {"location":"https://webrtc-demo.vcap.mozillalabs.com/manifest.json","name":"WebRTC Social Demo","iconURL":"https://webrtc-demo.vcap.mozillalabs.com/icon.png","workerURL":"https://webrtc-demo.vcap.mozillalabs.com/worker.js","sidebarURL":"https://webrtc-demo.vcap.mozillalabs.com/sidebar.htm","origin":"https://webrtc-demo.vcap.mozillalabs.com","enabled":true,"last_modified":135101330568}

5. Restart the browser.

6. Login with Persona when the SocialAPI sidebbar shows up. Get a friend to login (or login with a new profile on the same machine), and click to initiate a video call. You can drag-and-drop to share files and tabs!

Local Development
-----------------
It is easier to hack on this by setting up a local server:

    $ npm install
    $ env PORT=5000 AUDIENCE="http://localhost:5000" node app.js

and set the SocialAPI provider to:

    social.manifest.facebook: {"location":"http://localhost:5000/manifest.json","name":"WebRTC Social Demo","iconURL":"http://localhost:5000/icon.png","workerURL":"http://localhost:5000/worker.js","sidebarURL":"http://localhost:5000/sidebar.htm","origin":"http://localhost:5000","enabled":true,"last_modified":135101330568}

