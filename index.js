var os = require('os')
,	fs = require('fs')
,	path = require('path')
,	http = require('http');

var expireDays = 1;

var scripts = {
	"ga.js": {
		src: "http://www.google-analytics.com/ga.js"
	},
	"analytics.js": {
		src: "http://www.google-analytics.com/analytics.js"
	}
};

function PCache(req, res, next){
	var fn = req.url.substr(1);
	
	if(!scripts[fn])
		return next();
	
	PCache.getFile(fn, function(err, file){
		if(err)
			return next(err);
		
		var expires = new Date();
		
		expires.setDate(expires.getDate()+60);
		
		res.set('Expires', expires.toUTCString());
		res.sendFile(file);
	});
}

PCache.getFile = function(fn, cb){
	var tmp = path.join(os.tmpdir(), fn)
	,	exists = fs.existsSync(tmp);
	
	if(exists){
		cb(null, tmp);
		
		var expire = fs.statSync(tmp).ctime;
		
		expire.setDate(expire.getDate() + expireDays);
		
		if(Date.now() < expire.getTime())
			return;
	}
	
	PCache.getRemoteFile(scripts[fn].src, function(err, r){
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