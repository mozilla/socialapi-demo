VERSION = 0.10

all:
	rm ../static/webrtc.xpi
	sed "s/@VERSION@/$(VERSION)/" < install.rdf.in > install.rdf
	zip ../static/webrtc.xpi bootstrap.js options.xul chrome.manifest install.rdf \
            styles/*.css
	sed "s/@VERSION@/$(VERSION)/; \
       s/@SHA256@/"`shasum -a 256 ../static/webrtc.xpi |cut -f1 -d' '`"/" \
	  < update.rdf.in > ../static/update.rdf
	@echo
	@echo "Did you remember to update the version number in Makefile?"
