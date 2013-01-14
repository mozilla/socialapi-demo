all:
	rm ../static/webrtc.xpi
	zip ../static/webrtc.xpi bootstrap.js chrome.manifest install.rdf \
            styles/*.css
	@echo "Did you remember to update the version in install.rdf?"
	@echo "Don't forget to update ../static/update.rdf!"
	@echo "sha256 sum is:"
	shasum -a 256 ../static/webrtc.xpi
