var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
    res.render('index', { title: 'OAuth Tester', header_text: 'OAuth 2.0 Tester' });
});

module.exports = router;
