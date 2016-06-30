"use strict";

const os = require('os');
const fs = require('fs');
const Url = require('url');
const path = require('path');
const http = require('http');
const https = require('https');

//facebook re
const fbre = /^fb-(\w{2}_\w{2})\.js/;


function PCache(req, res, next){
	// eliminamos el query añadido por jQuery.ajax con cache false
	let fn = req.url.substr(1).replace(/\?_=\d+$/, '');

	const data = PCache.getData(fn);

	if(!data)
		return next();

	PCache.getFile(data, function(err, file){
		if(err)
			return next(err);
		
		var expires = new Date();
		
		expires.setDate(expires.getDate() + (data.expireDays || PCache.expireDays));
		
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
	let m = fn.match(fbre);

	if(m) {
		fn = 'fb-' + m[1] + '.js';

		PCache.files[fn] = {
			fn: fn,
			src: "https://connect.facebook.net/" + m[1] + "/sdk.js"
		};
	}

	if(!PCache.files[fn])
		return;

	if(!PCache.files[fn].fn)
		PCache.files[fn].fn = fn;

	return PCache.files[fn];
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

PCache.getFile = function(data, cb){
	let filename = data.fn;
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