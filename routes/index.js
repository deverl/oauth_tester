var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Oauth Tester', header_text: 'Oauth Tester for Quickbooks Time' });
});

module.exports = router;
