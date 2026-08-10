const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', (req, res) => {
    res.render('index', { title: 'OAuth Tester', header_text: 'OAuth 2.0 Tester' });
});

module.exports = router;
