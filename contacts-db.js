
var sqlite3 = require("sqlite3").verbose()
,   magic   = require("mime-magic")
,   pth     = require("path")
,   fs      = require("fs")
;

// some things to search on for matching (should add more)
var recordSearchFields = "ZNAME ZNAMENORMALIZED ZNAME1 ZNICKNAME ZORGANIZATION ZMAIDENNAME " +
                          "ZPHONETICFIRSTNAME ZPHONETICLASTNAME ZMIDDLENAME ZFIRSTNAME " +
                          "ZPHONETICMIDDLENAME ZLASTNAME ZSORTINGFIRSTNAME ZSORTINGLASTNAME";
recordSearchFields = recordSearchFields.split(" ");

function ContactsDB (path) {
    // XXX stupid default, change later
    this.path = path || "/Users/robin/Library/Application Support/AddressBook/AddressBook-v22.abcddb";
    this.db = new sqlite3.Database(this.path, sqlite3.OPEN_READONLY);
};
ContactsDB.prototype = {
    findContacts:   function (search, populate, cb) {
        var sql = search ?
                    "SELECT * FROM ZABCDRECORD WHERE " + recordSearchFields.join(" LIKE ? OR ") + " LIKE ?"
                    :
                    "SELECT * FROM ZABCDRECORD"
                    ;
        var params = [], res = [];
        if (search) {
            for (var i = 0, n = recordSearchFields.length; i < n; i++) params.push("%" + search + "%");
        }
        var self = this, got = 0, need = 0;
        this.db.all(
                    sql
                ,   params
                ,   function (err, rows) {
                        if (err) return console.log("ERROR: " + err);
                        need = rows.length;
                        for (var i = 0, n = rows.length; i < n; i++) {
                            var row = rows[i];
                            new Contact(row, populate, self, function (contact) {
                                res.push(contact);
                                got++;
                                if (got == need) cb(null, res);
                            });
                        }
                    }
        );
    }
    
,   close:  function () {
        this.db.close();
    }
};

var allFields = "displayName name nickname phoneNumbers emails addresses ims organizations birthday note photos categories urls".split(" ");
function Contact (row, populate, cdb, cb) {
    this.db = cdb.db;
    // default values
    this._id            = row.Z_PK;
    this.id             = row.ZUNIQUEID;
    this.displayName    = null;
    this.name           = null;
    this.nickname       = null;
    this.phoneNumbers   = null;
    this.emails         = null;
    this.addresses      = null;
    this.ims            = null;
    this.organizations  = null;
    this.birthday       = null;
    this.note           = null;
    this.photos         = null;
    this.categories     = null;
    this.urls           = null;
    
    populate = populate ? populate.concat([]) : [];
    if (populate == "*") populate = allFields.concat([]);
    
    var self = this, next = function () {
        var want = populate.shift();
        if (want) {
            switch (want) {
                case "displayName":
                    var full = [];
                    if (row.ZFIRSTNAME) full.push(row.ZFIRSTNAME);
                    if (row.ZLASTNAME) full.push(row.ZLASTNAME);
                    self.displayName = full.join(" ");
                    next();
                    break;
                case "name":
                    self.name = {
                        familyName:         row.ZLASTNAME
                    ,   givenName:          row.ZFIRSTNAME
                    ,   middleName:         row.ZMIDDLENAME
                    ,   honorificPrefix:    row.ZTITLE
                    ,   honorificSuffix:    row.ZSUFFIX
                    };
                    next();
                    break;
                case "nickname":
                    self.nickname = row.ZNICKNAME;
                    next();
                    break;
                case "phoneNumbers":
                    self.populatePhoneNumbers(next);
                    break;
                case "emails":
                    self.populateEmails(next);
                    break;
                case "addresses":
                    self.populateAddresses(next);
                    break;
                case "ims":
                    self.populateIMs(next);
                    break;
                case "organizations":
                    if (row.ZORGANIZATION || row.ZDEPARTMENT || row.ZJOBTITLE) {
                        self.organizations = [{
                            pref:       !!row.ZORGANIZATION
                        ,   type:       null
                        ,   name:       row.ZORGANIZATION
                        ,   department: row.ZDEPARTMENT
                        ,   title:      row.ZJOBTITLE
                        }];
                    }
                    next();
                    break;
                case "birthday":
                    if (row.ZBIRTHDAYYEARLESS) {
                        self.birthday = new Date(row.ZBIRTHDAYYEARLESS * 1000);
                        if (row.ZBIRTHDAYYEAR) self.birthday.setFullYear(1 * row.ZBIRTHDAYYEAR);
                    }
                    next();
                    break;
                case "note":
                    self.populateNote(row.ZNOTE, next);
                    break;
                case "categories":
                    // XXX there's a grouping system but we're not using it now
                    next();
                    break;
                case "urls":
                    self.populateURLs(next);
                    break;
                case "photos":
                    self.populatePhotos(cdb.path, next);
                    break;
                default:
                    next();
                    break;
            }
        }
        else {
            cb(self);
        }
    };
    next();
}
function _simpleField (self, cb, table, objField, tblField, cleaner) {
    cleaner = cleaner || function (val) { return val; };
    self.db.all("select * from " + table + " where ZOWNER = ?", [self._id], function (err, rows) {
        if (err) return cb();
        if (rows) self[objField] = [];
        for (var i = 0, n = rows.length; i < n; i++) {
            var row = rows[i];
            self[objField].push({
                pref:   !!row.ZISPRIMARY
            ,   type:   row.ZLABEL ? row.ZLABEL.replace(/[\W_]/g, "").toLowerCase() : ""
            ,   value:  cleaner(row[tblField])
            });
        }
        cb();
    });
}
Contact.prototype = {
    populateEmails:  function (cb) {
        _simpleField(this, cb, "ZABCDEMAILADDRESS", "emails", "ZADDRESSNORMALIZED", function (val) {
            return "mailto:" + val;
        });
    }
,   populatePhoneNumbers:  function (cb) {
        _simpleField(this, cb, "ZABCDPHONENUMBER", "phoneNumbers", "ZFULLNUMBER", function (val) {
            return "tel:" + val.replace(/[^+\d]/g, "");
        });
    }
,   populateAddresses:  function (cb) {
        var self = this;
        self.db.all("select * from ZABCDPOSTALADDRESS where ZOWNER = ?", [self._id], function (err, rows) {
            if (err) return cb();
            if (rows) self.addresses = [];
            for (var i = 0, n = rows.length; i < n; i++) {
                var row = rows[i];
                self.addresses.push({
                    pref:           !!row.ZISPRIMARY
                ,   type:           row.ZLABEL ? row.ZLABEL.replace(/[\W_]/g, "").toLowerCase() : ""
                ,   streetAddress:  row.ZSTREET
                ,   locality:       row.ZCITY
                ,   region:         row.ZSTATE
                ,   postalCode:     row.ZZIPCODE
                ,   country:        row.ZCOUNTRYNAME
                ,   xxxCountryCode: row.ZCOUNTRYCODE
                });
            }
            cb();
        });
    }
,   populateIMs:  function (cb) {
        _simpleField(this, cb, "ZABCDMESSAGINGADDRESS", "ims", "ZADDRESS");
    }
,   populateURLs:  function (cb) {
        _simpleField(this, cb, "ZABCDURLADDRESS", "urls", "ZURL");
    }
,   populateNote:  function (id, cb) {
        var self = this;
        self.db.all("select * from ZABCDNOTE where Z_PK = ?", [id], function (err, rows) {
            if (err) return cb();
            var notes = [];
            for (var i = 0, n = rows.length; i < n; i++) notes.push(rows[i].ZTEXT);
            self.note = notes.join("\n");
            cb();
        });
    }
,   populatePhotos:  function (path, cb) {
        if (!path) return cb();
        var id = this.id.replace(/:.*/, "")
        ,   dir = pth.dirname(path)
        ,   img = pth.join(dir, "Images", id)
        ,   gotImg;
        if (pth.existsSync(img)) gotImg = img;
        else if (pth.existsSync(img + ".jpeg")) gotImg = img + ".jpeg";
        else return cb();
        var self = this;
        magic.fileWrapper(gotImg, function (err, mime) {
            if (err) mime = "";
            fs.readFile(gotImg, function (err, data) {
                if (err) return cb();
                self.photos = [{
                    pref:   false
                ,   type:   null
                ,   value:  "data:" + mime + ";base64," + data.toString("base64")
                }];
                cb();
            });
        });
    }
,   toLiteralObject: function () {
        var ret = {}
        ,   fields = [].concat("id", allFields);
        ;
        for (var i = 0, n = fields.length; i < n; i++) {
            var fld = fields[i];
            ret[fld] = this[fld];
        }
        return ret;
    }
};

exports.ContactsDB = ContactsDB;
