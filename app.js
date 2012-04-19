
var express = require("express")
,   app = module.exports = express.createServer()
;

// configuration
app.configure(function(){
    app.use(express.bodyParser());
    app.use(app.router);
    app.use(express.static(__dirname + "/public"));
});
app.configure("development", function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});
app.configure("production", function(){
    app.use(express.errorHandler()); 
});

// routes
app.get("/", function (req, res, next) {
    // XXX return a static index.html that registers the intent
});

app.get("/contacts-api", function (req, res, next) {
    // XXX use the query arguments to get the right data
});

app.listen(4001);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
