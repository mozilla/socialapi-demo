// This object currently assumes the following elements are defined in the web page for calls:
// remoteVideo, remoteAudio, localVideo, localAudio
var webrtcMedia = {
  hasInternetAccess: true,
  startCall: function webrtcMedia_startCall(aPerson, aWin, aAudioOnly, aConnectionCallback,
                                            aDataConnectionCallback) {
    var pc = this._createBasicPc(aWin, aPerson, true, aAudioOnly, aConnectionCallback,
                                 aDataConnectionCallback);

    (aAudioOnly ? this._setupAudioOnly : this._setupAudioVideo)(aWin,
      pc,
      function() {
        pc.createOffer(function(offer) {
          pc.setLocalDescription(offer, function() {
            $.ajax({
              type: 'POST',
              url: '/offer',
              contentType: 'application/json',
              data: JSON.stringify({
                to: aPerson,
                request: JSON.stringify(offer)
              })
            });
          }, function(err) { alert("setLocalDescription failed: " + err);
          });
        }, function(err) { alert("createOffer failed: " + err); });
      });
    return pc;
  },

  handleOffer: function webrtcMedia_handleOffer(aData, aWin, aAudioOnly, aConnectionCallback,
                                                aDataConnectionCallback) {
    var pc = this._createBasicPc(aWin, aData.from, false, aAudioOnly, aConnectionCallback,
                                 aDataConnectionCallback);

    pc.setRemoteDescription(JSON.parse(aData.request), function() {
      (aAudioOnly ? webrtcMedia._setupAudioOnly :
                    webrtcMedia._setupAudioVideo)(aWin, pc, function() {
        pc.createAnswer(function(answer) {
          if (aAudioOnly) {
            // If the user doesn't want video, remove the receive-only
            // video part of the SDP answer so that the other party
            // knows it shouldn't send it.
            answer.sdp = answer.sdp.split("m=")
                               .filter(function(s) { return !s.startsWith("video"); })
                               .join("m=");
          }
          pc.setLocalDescription(answer, function() {
            var randomPort = function() {
              return Math.round(Math.random() * 60535) + 5000;
            };
            var localPort = randomPort();
            var remotePort = randomPort();
            while (remotePort == localPort) // Avoid being extremely unlucky...
              remotePort = randomPort();
            $.ajax({
              type: 'POST',
              url: '/answer',
              contentType: 'application/json',
              data: JSON.stringify({
                to: aData.from,
                request: JSON.stringify(answer),
                callerPort: remotePort,
                calleePort: localPort
              })
            });
            pc.connectDataConnection(localPort, remotePort);
          }, function(err) {alert("failed to setLocalDescription, " + err);});
        }, function(err) {alert("failed to createAnswer, " + err);});
      }, true);
    }, function(err) {alert("failed to setRemoteDescription, " + err); });

    return pc;
  },

  endCall: function webrtcMedia_stopCall(aPc, aDc, aWin, aAudioOnly) {
    var mediaElements = ["remoteAudio"];
    if (!aAudioOnly)
      mediaElements = mediaElements.concat("remoteVideo", "localVideo");
    else
      mediaElements.push("localAudio");

    // Stop each media element
    mediaElements.forEach(function (aElemId) {
      var element = aWin.document.getElementById(aElemId);
      element.pause();
      if (aElemId.indexOf("local") != -1) {
        if (aPc)
          aPc.removeStream(element.mozSrcObject);
        if (element.mozSrcObject)
          element.mozSrcObject.stop();
      }
      element.mozSrcObject = null;
    });

    if (aPc)
      aPc.close();
    if (aDc)
      aDc.close();
  },

  _createBasicPc: function webrtcMedia_createBasicPc(aWin, aPerson, aOriginator, aAudioOnly,
                                                     aConnectionCallback,
                                                     aDataConnectionCallback) {
    var params;
    if (!this.hasInternetAccess)
      params = {iceServers: []};
    var pc = new aWin.mozRTCPeerConnection(params);
    pc.onaddstream = function(obj) {
      var type = obj.type;
      if (type == "video") {
        var video = aWin.document.getElementById("remoteVideo");
        video.mozSrcObject = obj.stream;
        video.play();
      } else if (type == "audio") {
        var audio = aWin.document.getElementById("remoteAudio");
        audio.mozSrcObject = obj.stream;
        audio.play();
      } else {
        alert("sender onaddstream of unknown type, obj = " + obj.toSource());
      }
    };
    pc.ondatachannel = function(aChannel) {
      if (aDataConnectionCallback)
        aDataConnectionCallback(aWin, aChannel, aPerson);
    };
    pc.onconnection = function() {
      if (aConnectionCallback) {
        aConnectionCallback(aWin, pc, aPerson, aOriginator);
      }
    };
    pc.onclosedconnection = function(obj) {
    };
    return pc;
  },

  _setupAudioOnly: function webrtcMedia_setupAudioOnly(aWin, aPC, aSuccessCallback, aCanFake) {
    try {
      webrtcMedia._getAudioMedia(aWin, function(stream) {
        var audio = aWin.document.getElementById("localAudio");
        audio.mozSrcObject = stream;
        audio.play();
        aPC.addStream(stream);
        aSuccessCallback();
      }, function(err) { alert("failed to get microphone: " + err); }, true);
    } catch(e) { alert(e); }
  },

  _setupAudioVideo: function webrtcMedia_setupAudioVideo(aWin, aPC, aSuccessCallback, aCanFake) {
    try {
      webrtcMedia._getAudioVideoMedia(aWin, function(stream) {
        var video = aWin.document.getElementById("localVideo");
        video.mozSrcObject = stream;
        video.play();
        aPC.addStream(stream);
        aSuccessCallback();
      }, function(err) { alert("failed to get camera: " + err); }, true);
    } catch(e) { alert(e); }
  },

  _getAudioVideoMedia: function webrtcMedia_getVideoMedia(aWin, aSuccessCallback, aErrorCallback,
                                                     aCanFake) {
    aWin.navigator.mozGetUserMedia({video: true, audio: true}, function(stream) {
      aSuccessCallback(stream);
    }, function(err) {
      if (aCanFake && err == "HARDWARE_UNAVAILABLE") {
        aWin.navigator.mozGetUserMedia({video: true, audio: true, fake: true}, aSuccessCallback, aErrorCallback);
      } else {
        aErrorCallback(err);
      }
    });
  },

  _getAudioMedia: function webrtcMeida_getAudioMedia(aWin, aSuccessCallback, aErrorCallback,
                                                     aCanFake) {
    aWin.navigator.mozGetUserMedia({audio: true}, function(stream) {
      aSuccessCallback(stream);
    }, function(err) {
      if (aCanFake && err == "HARDWARE_UNAVAILABLE") {
        aWin.navigator.mozGetUserMedia({audio: true, fake: true}, aSuccessCallback, aErrorCallback);
      } else {
        aErrorCallback(err);
      }
    });
  }
};
