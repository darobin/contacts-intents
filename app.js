
var express = require("express")
,   cdb = require("./contacts-db")
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
    res.sendfile("public/index.html");
});

app.get("/contacts-api", function (req, res, next) {
    // XXX use the query arguments to get the right data
    db.findContacts("robin", "*", function (err, res) {
        for (var i = 0, n = res.length; i < n; i++) console.log(res[i].toLiteralObject());
    });
});

app.listen(4001);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
