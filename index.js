"use strict";

const os = require('os');
const fs = require('fs');
const Url = require('url');
const path = require('path');
const http = require('http');

let files = {
	"ga.js": {
		src: "http://www.google-analytics.com/ga.js"
	},
	"analytics.js": {
		src: "http://www.google-analytics.com/analytics.js"
	}
};

function PCache(req, res, next){
	var fn = req.url.substr(1);
	
	if(!files[fn])
		return next();
	
	PCache.getFile(fn, function(err, file){
		if(err)
			return next(err);
		
		var expires = new Date();
		
		expires.setDate(expires.getDate() + (files[fn].expireDays || PCache.expireDays));
		
		res.set('Expires', expires.toUTCString());
		
		res.sendFile(file, {
			headers: {
				Expires: expires.toUTCString()
			}
		});
	});
}

PCache.cachedMinutes = 10;
PCache.expireDays = 60;

PCache.set = function(obj, opt){
	if(typeof obj === 'string') {
		let obj_ = {};

		obj_[obj] = opt;

		obj = obj_;
	}

	Object.keys(obj).forEach(fn => {
		if (typeof obj[fn] === 'string')
			obj[fn] = {src: obj[fn]};

		files[fn] = obj[fn];
	});

	return PCache;
};

PCache.getFile = function(fn, cb){
	let data = files[fn];
	let filename = data.fn || fn;
	let tmp = path.join(os.tmpdir(), 'proxy-cache-' + filename.replace(/\//g, '__'));
	
	fs.stat(tmp, function(err, stats){
		if(err && err.code !== 'ENOENT')
			return cb(err);
		
		if(stats){
			cb(null, tmp);

			var expire = fs.statSync(tmp).ctime;

			expire.setMinutes(expire.getMinutes() + (data.cachedMinutes || PCache.cachedMinutes));

			if(Date.now() < expire.getTime())
				return;
		}

		PCache.getRemoteLastModified(data.src, function(lastModified){
			if(stats && stats.mtime.getTime() > lastModified.getTime())
				return;
			
			PCache.getRemoteFile(data.src, function(err, r){
				if(err){
					console.error('Error with the request:', err.message);

					if(!stats)
						cb(err);

					return;
				}

				fs.writeFileSync(tmp, r);

				if(!stats)
					cb(null, tmp);
			});
		});
	});
};

PCache.getRemoteLastModified = function(url, cb){
	url = Url.parse(url);

	var options = {
		method: 'HEAD',
		host:  url.host,
		port: url.protocol === 'http:'? 80 : 443,
		path: url.path
	};

	http.request(options, function(res) {
		cb(new Date(res.headers['last-modified'] || res.headers['Last-Modified']));
	}).end();
};

PCache.getRemoteFile = function(url, cb){
	http.get(url, function(response){
		var body = '';
		response.on('data', function(d) {
            body += d;
        });
        response.on('end', function() {
			cb(null, body);
        });
	}).on('error', cb);
};

module.exports = PCache;