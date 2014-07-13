var express = require('express');
var app = express();
app.use(express.static(__dirname));
app.listen(3000);
console.log("Web server started at http://localhost:3000");