"use strict";

const os = require('os');
const fs = require('fs');
const Url = require('url');
const path = require('path');
const http = require('http');
const https = require('https');

//facebook re
const fbre = /^fb-(\w{2}_\w{2})\.js$/;


function PCache(req, res, next){
	var fn = req.url.substr(1);
	
	if(!PCache.getData(fn))
		return next();
	
	PCache.getFile(fn, function(err, file){
		if(err)
			return next(err);
		
		var expires = new Date();
		
		expires.setDate(expires.getDate() + (PCache.files[fn].expireDays || PCache.expireDays));
		
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
PCache.files = {
	"ga.js": {
		src: "http://www.google-analytics.com/ga.js"
	},
	"analytics.js": {
		src: "http://www.google-analytics.com/analytics.js"
	}
};

PCache.getData = function(fn){
	if(PCache.files[fn])
		return PCache.files[fn];

	let m = fn.match(fbre);

	if(m)
		return (PCache.files[fn] = {src: "https://connect.facebook.net/" + m[1] + "/all.js"});
};

PCache.set = function(obj, opt){
	if(typeof obj === 'string') {
		let obj_ = {};

		obj_[obj] = opt;

		obj = obj_;
	}

	Object.keys(obj).forEach(fn => {
		if (typeof obj[fn] === 'string')
			obj[fn] = {src: obj[fn]};

		PCache.files[fn] = obj[fn];
	});

	return PCache;
};

PCache.getFile = function(fn, cb){
	let data = PCache.files[fn];
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

	const options = {
		method: 'HEAD',
		host:  url.host,
		port: url.protocol === 'http:' ? 80 : 443,
		path: url.path
	};

	const server = url.protocol === 'http:' ? http : https;

	server.request(options, function(res) {
		cb(new Date(res.headers['last-modified'] || res.headers['Last-Modified']));
	}).end();
};

PCache.getRemoteFile = function(url, cb){
	const server = url.indexOf('https:') === 0 ? https : http;

	server.get(url, function(response){
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