var os = require('os')
,	fs = require('fs')
,	path = require('path')
,	http = require('http');

var files = {
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

PCache.cachedDays = 1;
PCache.expireDays = 60;

PCache.set = function(fn, opt){
	if(typeof opt === 'string')
		opt = {src: opt};
	
	files[fn] = opt;
};

PCache.getFile = function(fn, cb){
	var data = files[fn]
	,	filename = data.fn || fn
	,	tmp = path.join(os.tmpdir(), 'proxy-cache-' + filename)
	,	exists = fs.existsSync(tmp);
	
	if(exists){
		cb(null, tmp);
		
		var expire = fs.statSync(tmp).ctime;
		
		expire.setDate(expire.getDate() + (data.cachedDays || PCache.cachedDays));
		
		if(Date.now() < expire.getTime())
			return;
	}
	
	PCache.getRemoteFile(data.src, function(err, r){
		if(err){
			console.error('Error with the request:', err.message);
			
			if(!exists)
				cb(err);
			
			return;
		}
		
		fs.writeFileSync(tmp, r);
		
		if(!exists)
			cb(null, tmp);
    });
	
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